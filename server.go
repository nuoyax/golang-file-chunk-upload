// main.go
package main

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

var (
	db            *sql.DB
	tmpDir        = "./tmp_uploads"
	finalDir      = "./store"
	uploadLocks   = make(map[string]*sync.Mutex)
	uploadLocksMu sync.Mutex
)

// Request/Response Models
type (
	// UploadRequest 创建上传任务请求
	UploadRequest struct {
		FileName  string `json:"file_name" binding:"required"`
		TotalSize int64  `json:"total_size" binding:"required,min=1"`
		ChunkSize int    `json:"chunk_size" binding:"required,min=1"`
		MD5       string `json:"md5,omitempty"`
	}

	// UploadResponse 创建上传任务响应
	UploadResponse struct {
		UploadID    string `json:"upload_id"`
		ChunkSize   int    `json:"chunk_size"`
		TotalChunks int    `json:"total_chunks"`
	}

	// ChunkUploadResponse 分片上传响应
	ChunkUploadResponse struct {
		Index int    `json:"index"`
		Size  int64  `json:"size"`
		MD5   string `json:"md5"`
	}

	// UploadStatusResponse 上传状态响应
	UploadStatusResponse struct {
		UploadID string `json:"upload_id"`
		Status   string `json:"status"`
		Chunks   []int  `json:"chunks"`
		Progress struct {
			Completed int `json:"completed"`
			Total     int `json:"total"`
			Percent   int `json:"percent"`
		} `json:"progress"`
	}

	// CompleteResponse 完成上传响应
	CompleteResponse struct {
		Status    string `json:"status"`
		FinalPath string `json:"final_path"`
		FileSize  int64  `json:"file_size"`
		MD5       string `json:"md5,omitempty"`
	}

	// ErrorResponse 错误响应
	ErrorResponse struct {
		Error   string `json:"error"`
		Code    int    `json:"code"`
		Message string `json:"message,omitempty"`
	}

	// FileHistoryResponse 文件历史记录响应
	FileHistoryResponse struct {
		Total   int           `json:"total"`
		Page    int           `json:"page"`
		PerPage int           `json:"per_page"`
		Files   []*FileRecord `json:"files"`
	}

	// FileRecord 文件记录
	FileRecord struct {
		UploadID    string    `json:"upload_id"`
		FileName    string    `json:"file_name"`
		FileSize    int64     `json:"file_size"`
		Status      string    `json:"status"`
		ChunkSize   int       `json:"chunk_size"`
		TotalChunks int       `json:"total_chunks"`
		CreatedAt   time.Time `json:"created_at"`
		UpdatedAt   time.Time `json:"updated_at"`
		CompletedAt *time.Time `json:"completed_at,omitempty"`
	}

	// FileHistoryQuery 文件历史查询参数
	FileHistoryQuery struct {
		Page    int    `json:"page"`
		PerPage int    `json:"per_page"`
		Status  string `json:"status"`
		Keyword string `json:"keyword"`
		SortBy  string `json:"sort_by"`
		Order   string `json:"order"`
	}
)

// Constants
const (
	StatusInProgress = "in_progress"
	StatusCompleted  = "completed"
	StatusFailed     = "failed"

	DefaultPage    = 1
	DefaultPerPage = 20
	MaxPerPage     = 100
)

// Helper functions
func getUploadLock(uploadID string) *sync.Mutex {
	uploadLocksMu.Lock()
	defer uploadLocksMu.Unlock()
	if m, ok := uploadLocks[uploadID]; ok {
		return m
	}
	m := &sync.Mutex{}
	uploadLocks[uploadID] = m
	return m
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{
		Error:   http.StatusText(status),
		Code:    status,
		Message: message,
	})
}

func parseQueryParams(r *http.Request) *FileHistoryQuery {
	query := &FileHistoryQuery{
		Page:    DefaultPage,
		PerPage: DefaultPerPage,
		SortBy:  "created_at",
		Order:   "desc",
	}

	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			query.Page = page
		}
	}

	if perPageStr := r.URL.Query().Get("per_page"); perPageStr != "" {
		if perPage, err := strconv.Atoi(perPageStr); err == nil && perPage > 0 {
			if perPage > MaxPerPage {
				perPage = MaxPerPage
			}
			query.PerPage = perPage
		}
	}

	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = status
	}

	if keyword := r.URL.Query().Get("keyword"); keyword != "" {
		query.Keyword = keyword
	}

	if sortBy := r.URL.Query().Get("sort_by"); sortBy != "" {
		query.SortBy = sortBy
	}

	if order := r.URL.Query().Get("order"); order != "" {
		if strings.ToLower(order) == "asc" || strings.ToLower(order) == "desc" {
			query.Order = order
		}
	}

	return query
}

// Database initialization
func initDB(dsn string) error {
	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	db.SetConnMaxLifetime(time.Minute * 3)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)
	return db.Ping()
}

// Handlers

// CreateUpload 创建上传任务
// POST /api/v1/uploads
func CreateUpload(w http.ResponseWriter, r *http.Request) {
	var req UploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.FileName == "" || req.TotalSize <= 0 || req.ChunkSize <= 0 {
		writeError(w, http.StatusBadRequest, "Missing or invalid required fields: file_name, total_size, chunk_size")
		return
	}

	totalChunks := int((req.TotalSize + int64(req.ChunkSize) - 1) / int64(req.ChunkSize))
	uploadID := uuid.New().String()

	_, err := db.Exec(
		"INSERT INTO uploads (upload_id, file_name, total_size, chunk_size, total_chunks, status) VALUES (?, ?, ?, ?, ?, ?)",
		uploadID, req.FileName, req.TotalSize, req.ChunkSize, totalChunks, StatusInProgress,
	)
	if err != nil {
		log.Println("Database insert upload error:", err)
		writeError(w, http.StatusInternalServerError, "Failed to create upload task")
		return
	}

	// Create temporary directory for chunks
	_ = os.MkdirAll(filepath.Join(tmpDir, uploadID), 0755)

	resp := UploadResponse{
		UploadID:    uploadID,
		ChunkSize:   req.ChunkSize,
		TotalChunks: totalChunks,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// UploadChunk 上传文件分片
// PUT /api/v1/uploads/{upload_id}/chunks/{index}
func UploadChunk(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	uploadID := vars["upload_id"]
	indexStr := vars["index"]

	index, err := strconv.Atoi(indexStr)
	if err != nil || index < 0 {
		writeError(w, http.StatusBadRequest, "Invalid chunk index")
		return
	}

	// Get upload info
	var chunkSize, totalChunks int
	var status string
	err = db.QueryRow(
		"SELECT chunk_size, total_chunks, status FROM uploads WHERE upload_id = ?",
		uploadID,
	).Scan(&chunkSize, &totalChunks, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Upload task not found")
			return
		}
		log.Println("Database query error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	if status != StatusInProgress {
		writeError(w, http.StatusBadRequest, "Upload is not in progress")
		return
	}

	if index >= totalChunks {
		writeError(w, http.StatusBadRequest, "Chunk index out of range")
		return
	}

	// Create temporary directory
	tmpPath := filepath.Join(tmpDir, uploadID)
	_ = os.MkdirAll(tmpPath, 0755)
	chunkPath := filepath.Join(tmpPath, fmt.Sprintf("chunk_%06d", index))

	// Create temporary file
	tmpFile, err := os.Create(chunkPath + ".part")
	if err != nil {
		log.Println("Create chunk file error:", err)
		writeError(w, http.StatusInternalServerError, "Server error")
		return
	}
	defer tmpFile.Close()

	// Read and write chunk data with MD5 calculation
	hasher := md5.New()
	mw := io.MultiWriter(tmpFile, hasher)
	n, err := io.Copy(mw, r.Body)
	if err != nil {
		log.Println("Write chunk error:", err)
		writeError(w, http.StatusInternalServerError, "Write error")
		return
	}
	tmpFile.Close()

	chunkMD5 := hex.EncodeToString(hasher.Sum(nil))

	// Atomically rename temporary file
	if err := os.Rename(chunkPath+".part", chunkPath); err != nil {
		log.Println("Rename chunk file error:", err)
		writeError(w, http.StatusInternalServerError, "Server error")
		return
	}

	// Save chunk metadata to database
	_, err = db.Exec(`
		INSERT INTO upload_chunks (upload_id, chunk_index, chunk_size, chunk_md5)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE 
			chunk_size = VALUES(chunk_size), 
			chunk_md5 = VALUES(chunk_md5), 
			received_at = CURRENT_TIMESTAMP
	`, uploadID, index, n, chunkMD5)
	if err != nil {
		log.Println("Database insert chunk error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	resp := ChunkUploadResponse{
		Index: index,
		Size:  n,
		MD5:   chunkMD5,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// GetUploadStatus 获取上传状态
// GET /api/v1/uploads/{upload_id}
func GetUploadStatus(w http.ResponseWriter, r *http.Request) {
	uploadID := mux.Vars(r)["upload_id"]

	// Get upload basic info
	var fileName string
	var totalSize int64
	var chunkSize, totalChunks int
	var status string
	err := db.QueryRow(
		"SELECT file_name, total_size, chunk_size, total_chunks, status FROM uploads WHERE upload_id = ?",
		uploadID,
	).Scan(&fileName, &totalSize, &chunkSize, &totalChunks, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Upload task not found")
			return
		}
		log.Println("Database query error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Get uploaded chunks
	rows, err := db.Query("SELECT chunk_index FROM upload_chunks WHERE upload_id = ? ORDER BY chunk_index", uploadID)
	if err != nil {
		log.Println("Database query chunks error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	var chunks []int
	for rows.Next() {
		var idx int
		rows.Scan(&idx)
		chunks = append(chunks, idx)
	}

	// Build response
	resp := UploadStatusResponse{
		UploadID: uploadID,
		Status:   status,
		Chunks:   chunks,
	}
	resp.Progress.Completed = len(chunks)
	resp.Progress.Total = totalChunks
	if totalChunks > 0 {
		resp.Progress.Percent = int(float64(len(chunks)) / float64(totalChunks) * 100)
	}

	writeJSON(w, http.StatusOK, resp)
}

// CompleteUpload 完成上传
// POST /api/v1/uploads/{upload_id}/complete
func CompleteUpload(w http.ResponseWriter, r *http.Request) {
	uploadID := mux.Vars(r)["upload_id"]
	lock := getUploadLock(uploadID)
	lock.Lock()
	defer lock.Unlock()

	// Fetch upload metadata
	var fileName string
	var totalSize int64
	var chunkSize, totalChunks int
	var status string
	err := db.QueryRow(
		"SELECT file_name, total_size, chunk_size, total_chunks, status FROM uploads WHERE upload_id = ?",
		uploadID,
	).Scan(&fileName, &totalSize, &chunkSize, &totalChunks, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "Upload task not found")
			return
		}
		log.Println("Database read upload error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	if status == StatusCompleted {
		writeError(w, http.StatusBadRequest, "Upload already completed")
		return
	}

	// Find and validate chunks
	chunkFiles, missing, err := findAndValidateChunks(uploadID, totalChunks)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if len(missing) > 0 {
		msg := fmt.Sprintf("Missing chunks: %v (found %d, expected %d)", missing, len(chunkFiles), totalChunks)
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	// Merge chunks
	finalPath, fileSize, fileMD5, err := mergeChunks(uploadID, fileName, chunkFiles)
	if err != nil {
		log.Println("Merge chunks error:", err)
		writeError(w, http.StatusInternalServerError, "Failed to merge chunks")
		return
	}

	// Update database status - 只更新状态，不更新 final_path 和 file_md5
	_, err = db.Exec(
		"UPDATE uploads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?",
		StatusCompleted, uploadID,
	)
	if err != nil {
		log.Println("Database update upload error:", err)
		// Non-fatal: don't affect client response
	}

	// Async cleanup
	go cleanupChunks(uploadID)

	log.Printf("Upload %s completed successfully -> %s (size: %d bytes)\n", uploadID, finalPath, fileSize)

	resp := CompleteResponse{
		Status:    StatusCompleted,
		FinalPath: finalPath,
		FileSize:  fileSize,
		MD5:       fileMD5,
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetFileHistory 获取文件上传历史记录
// GET /api/v1/files/history
func GetFileHistory(w http.ResponseWriter, r *http.Request) {
	query := parseQueryParams(r)

	// 构建 WHERE 条件
	whereClause := "WHERE 1=1"
	args := []interface{}{}

	// 添加过滤器
	if query.Status != "" {
		whereClause += " AND status = ?"
		args = append(args, query.Status)
	}

	if query.Keyword != "" {
		whereClause += " AND file_name LIKE ?"
		args = append(args, "%"+query.Keyword+"%")
	}

	// 构建排序
	allowedSortFields := map[string]bool{
		"created_at":  true,
		"updated_at":  true,
		"file_name":   true,
		"total_size":  true,
		"total_chunks": true,
	}
	
	sortBy := query.SortBy
	if !allowedSortFields[sortBy] {
		sortBy = "created_at"
	}
	
	order := strings.ToUpper(query.Order)
	if order != "ASC" && order != "DESC" {
		order = "DESC"
	}
	orderBy := fmt.Sprintf("ORDER BY %s %s", sortBy, order)

	// 构建分页
	offset := (query.Page - 1) * query.PerPage
	limitClause := "LIMIT ? OFFSET ?"

	// 获取总数
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM uploads %s", whereClause)
	log.Printf("Count query: %s, args: %v", countQuery, args)
	
	var total int
	err := db.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		log.Printf("Database count query error: %v", err)
		writeError(w, http.StatusInternalServerError, "Database count error")
		return
	}

	// 如果总数是0，直接返回空结果
	if total == 0 {
		resp := FileHistoryResponse{
			Total:   0,
			Page:    query.Page,
			PerPage: query.PerPage,
			Files:   []*FileRecord{},
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// 构建数据查询
	selectQuery := fmt.Sprintf(`
		SELECT 
			upload_id, file_name, total_size, chunk_size, total_chunks, 
			status, created_at, updated_at
		FROM uploads 
		%s 
		%s 
		%s
	`, whereClause, orderBy, limitClause)

	// 为数据查询准备参数（需要添加分页参数）
	queryArgs := make([]interface{}, len(args))
	copy(queryArgs, args)
	queryArgs = append(queryArgs, query.PerPage, offset)

	log.Printf("Select query: %s, args: %v", selectQuery, queryArgs)

	// 执行查询
	rows, err := db.Query(selectQuery, queryArgs...)
	if err != nil {
		log.Printf("Database select query error: %v", err)
		writeError(w, http.StatusInternalServerError, "Database query error")
		return
	}
	defer rows.Close()

	// 处理结果
	var files []*FileRecord
	for rows.Next() {
		file := &FileRecord{}
		
		err := rows.Scan(
			&file.UploadID, &file.FileName, &file.FileSize, &file.ChunkSize, &file.TotalChunks,
			&file.Status, &file.CreatedAt, &file.UpdatedAt,
		)
		if err != nil {
			log.Printf("Database scan error: %v", err)
			continue
		}

		// 为已完成文件设置完成时间
		if file.Status == StatusCompleted {
			file.CompletedAt = &file.UpdatedAt
		}

		files = append(files, file)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Database rows error: %v", err)
		writeError(w, http.StatusInternalServerError, "Database rows error")
		return
	}

	// 构建响应
	resp := FileHistoryResponse{
		Total:   total,
		Page:    query.Page,
		PerPage: query.PerPage,
		Files:   files,
	}

	writeJSON(w, http.StatusOK, resp)
}

// GetFileDetail 获取文件详情
// GET /api/v1/files/{upload_id}
func GetFileDetail(w http.ResponseWriter, r *http.Request) {
	uploadID := mux.Vars(r)["upload_id"]

	file, err := getFileByUploadID(uploadID)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "File not found")
			return
		}
		log.Println("Database query error:", err)
		writeError(w, http.StatusInternalServerError, "Database error")
		return
	}

	writeJSON(w, http.StatusOK, file)
}

// Helper functions
func getFileByUploadID(uploadID string) (*FileRecord, error) {
	file := &FileRecord{}

	query := `
		SELECT 
			upload_id, file_name, total_size, chunk_size, total_chunks, 
			status, created_at, updated_at
		FROM uploads 
		WHERE upload_id = ?
	`

	err := db.QueryRow(query, uploadID).Scan(
		&file.UploadID, &file.FileName, &file.FileSize, &file.ChunkSize, &file.TotalChunks,
		&file.Status, &file.CreatedAt, &file.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if file.Status == StatusCompleted {
		file.CompletedAt = &file.UpdatedAt
	}

	return file, nil
}

func findAndValidateChunks(uploadID string, totalChunks int) ([]string, []int, error) {
	tmpPath := filepath.Join(tmpDir, uploadID)
	pattern := filepath.Join(tmpPath, "chunk_*")
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, nil, fmt.Errorf("glob chunks error: %v", err)
	}

	if len(files) == 0 {
		return nil, nil, fmt.Errorf("no chunk files found")
	}

	// Parse and validate chunk indices
	indices := make(map[int]string)
	for _, file := range files {
		base := filepath.Base(file)
		if !strings.HasPrefix(base, "chunk_") {
			continue
		}

		idxStr := strings.TrimPrefix(base, "chunk_")
		idxStr = strings.TrimLeft(idxStr, "0")
		if idxStr == "" {
			indices[0] = file
			continue
		}

		index, err := strconv.Atoi(idxStr)
		if err != nil {
			// Try parsing without trimming zeros
			index, err = strconv.Atoi(strings.TrimPrefix(base, "chunk_"))
			if err != nil {
				log.Printf("Parse chunk index failed for %s: %v\n", file, err)
				continue
			}
		}
		indices[index] = file
	}

	// Check for missing chunks
	var missing []int
	for i := 0; i < totalChunks; i++ {
		if _, exists := indices[i]; !exists {
			missing = append(missing, i)
		}
	}

	// Sort files by index
	var sortedFiles []string
	for i := 0; i < totalChunks; i++ {
		if file, exists := indices[i]; exists {
			sortedFiles = append(sortedFiles, file)
		}
	}

	return sortedFiles, missing, nil
}

func mergeChunks(uploadID, fileName string, chunkFiles []string) (string, int64, string, error) {
	finalPath := filepath.Join(finalDir, fmt.Sprintf("%s_%s", uploadID, filepath.Base(fileName)))
	_ = os.MkdirAll(finalDir, 0755)
	
	tmpFinalPath := finalPath + ".part"
	out, err := os.Create(tmpFinalPath)
	if err != nil {
		return "", 0, "", err
	}
	defer out.Close()

	hasher := md5.New()
	totalWritten := int64(0)

	for i, chunkFile := range chunkFiles {
		f, err := os.Open(chunkFile)
		if err != nil {
			return "", 0, "", fmt.Errorf("open chunk %s: %v", chunkFile, err)
		}

		n, err := io.Copy(io.MultiWriter(out, hasher), f)
		f.Close()
		if err != nil {
			return "", 0, "", fmt.Errorf("copy chunk %s: %v", chunkFile, err)
		}

		totalWritten += n

		// Log progress for large files
		if i%50 == 0 {
			log.Printf("Merging upload %s: chunk %d/%d, written %d bytes\n", 
				uploadID, i+1, len(chunkFiles), totalWritten)
		}
	}

	if err := out.Close(); err != nil {
		return "", 0, "", err
	}

	// Rename to final path
	if err := os.Rename(tmpFinalPath, finalPath); err != nil {
		return "", 0, "", err
	}

	fileMD5 := hex.EncodeToString(hasher.Sum(nil))
	return finalPath, totalWritten, fileMD5, nil
}

func cleanupChunks(uploadID string) {
	tmpPath := filepath.Join(tmpDir, uploadID)
	if err := os.RemoveAll(tmpPath); err != nil {
		log.Printf("Cleanup chunks error for %s: %v\n", uploadID, err)
	} else {
		log.Printf("Cleaned up chunks for upload %s\n", uploadID)
	}
}

// HealthCheck 健康检查
// GET /api/v1/health
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	healthInfo := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC(),
		"version":   "1.0.0",
	}
	writeJSON(w, http.StatusOK, healthInfo)
}

func main() {
	// Ensure directories exist
	_ = os.MkdirAll(tmpDir, 0755)
	_ = os.MkdirAll(finalDir, 0755)

	// Connect to database
	dsn := "root:root@tcp(127.0.0.1:3306)/filedb?parseTime=true"
	if err := initDB(dsn); err != nil {
		log.Fatal("Database initialization failed:", err)
	}

	// Initialize router
	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api/v1").Subrouter()
	
	// Upload routes
	uploads := api.PathPrefix("/uploads").Subrouter()
	uploads.HandleFunc("", CreateUpload).Methods("POST")
	uploads.HandleFunc("/{upload_id}", GetUploadStatus).Methods("GET")
	uploads.HandleFunc("/{upload_id}/complete", CompleteUpload).Methods("POST")
	uploads.HandleFunc("/{upload_id}/chunks/{index}", UploadChunk).Methods("PUT", "POST")

	// File history routes
	files := api.PathPrefix("/files").Subrouter()
	files.HandleFunc("/history", GetFileHistory).Methods("GET")
	files.HandleFunc("/{upload_id}", GetFileDetail).Methods("GET")

	// System routes
	api.HandleFunc("/health", HealthCheck).Methods("GET")

	// Configure CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           86400,
	})

	// Start server
	srv := &http.Server{
		Addr:         ":8080",
		Handler:      c.Handler(r),
		ReadTimeout:  30 * time.Minute,
		WriteTimeout: 30 * time.Minute,
	}

	log.Println("Server starting on :8080")
	log.Println("Available endpoints:")
	log.Println("  POST   /api/v1/uploads")
	log.Println("  GET    /api/v1/uploads/{upload_id}")
	log.Println("  POST   /api/v1/uploads/{upload_id}/complete")
	log.Println("  PUT    /api/v1/uploads/{upload_id}/chunks/{index}")
	log.Println("  GET    /api/v1/files/history")
	log.Println("  GET    /api/v1/files/{upload_id}")
	log.Println("  GET    /api/v1/health")

	log.Fatal(srv.ListenAndServe())
}