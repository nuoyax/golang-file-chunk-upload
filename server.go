// main.go
package main

import (
	"crypto/md5"      // MD5哈希计算
	"database/sql"     // 数据库操作
	"encoding/hex"     // 十六进制编码
	"encoding/json"    // JSON编解码
	"fmt"              // 格式化IO
	"io"               // IO操作
	"log"              // 日志
	"net/http"         // HTTP服务
	"os"               // 操作系统功能
	"path/filepath"    // 文件路径处理
	"strconv"          // 字符串转换
	"strings"          // 字符串处理
	"sync"             // 同步原语
	"time"             // 时间处理

	_ "github.com/go-sql-driver/mysql" // MySQL驱动
	"github.com/google/uuid"           // UUID生成
	"github.com/gorilla/mux"           // HTTP路由
	"github.com/rs/cors"               // CORS处理
)

// 全局变量
var (
	db            *sql.DB           // 数据库连接
	tmpDir        = "./tmp_uploads" // 临时上传目录
	finalDir      = "./store"       // 最终文件存储目录
	uploadLocks   = make(map[string]*sync.Mutex) // 上传任务锁映射
	uploadLocksMu sync.Mutex         // 保护uploadLocks的互斥锁
)

// 请求/响应模型定义

// UploadRequest 创建上传任务请求
type UploadRequest struct {
	FileName  string `json:"file_name" binding:"required"`   // 文件名
	TotalSize int64  `json:"total_size" binding:"required,min=1"` // 文件总大小
	ChunkSize int    `json:"chunk_size" binding:"required,min=1"` // 分片大小
	MD5       string `json:"md5,omitempty"` // 文件MD5（可选）
}

// UploadResponse 创建上传任务响应
type UploadResponse struct {
	UploadID    string `json:"upload_id"`    // 上传任务ID
	ChunkSize   int    `json:"chunk_size"`   // 分片大小
	TotalChunks int    `json:"total_chunks"` // 总分片数
}

// ChunkUploadResponse 分片上传响应
type ChunkUploadResponse struct {
	Index int    `json:"index"` // 分片索引
	Size  int64  `json:"size"`  // 分片大小
	MD5   string `json:"md5"`   // 分片MD5
}

// UploadStatusResponse 上传状态响应
type UploadStatusResponse struct {
	UploadID string `json:"upload_id"` // 上传任务ID
	Status   string `json:"status"`    // 状态
	Chunks   []int  `json:"chunks"`    // 已上传分片列表
	Progress struct {
		Completed int `json:"completed"` // 已完成分片数
		Total     int `json:"total"`     // 总分片数
		Percent   int `json:"percent"`   // 完成百分比
	} `json:"progress"` // 进度信息
}

// CompleteResponse 完成上传响应
type CompleteResponse struct {
	Status    string `json:"status"`     // 状态
	FinalPath string `json:"final_path"` // 最终文件路径
	FileSize  int64  `json:"file_size"`  // 文件大小
	MD5       string `json:"md5,omitempty"` // 文件MD5
}

// ErrorResponse 错误响应
type ErrorResponse struct {
	Error   string `json:"error"`    // 错误类型
	Code    int    `json:"code"`     // 错误码
	Message string `json:"message,omitempty"` // 错误消息
}

// FileHistoryResponse 文件历史记录响应
type FileHistoryResponse struct {
	Total   int           `json:"total"`    // 总数
	Page    int           `json:"page"`     // 当前页
	PerPage int           `json:"per_page"` // 每页数量
	Files   []*FileRecord `json:"files"`    // 文件记录列表
}

// FileRecord 文件记录
type FileRecord struct {
	UploadID    string    `json:"upload_id"`    // 上传任务ID
	FileName    string    `json:"file_name"`    // 文件名
	FileSize    int64     `json:"file_size"`    // 文件大小
	Status      string    `json:"status"`       // 状态
	ChunkSize   int       `json:"chunk_size"`   // 分片大小
	TotalChunks int       `json:"total_chunks"` // 总分片数
	CreatedAt   time.Time `json:"created_at"`   // 创建时间
	UpdatedAt   time.Time `json:"updated_at"`   // 更新时间
	CompletedAt *time.Time `json:"completed_at,omitempty"` // 完成时间
}

// FileHistoryQuery 文件历史查询参数
type FileHistoryQuery struct {
	Page    int    `json:"page"`     // 页码
	PerPage int    `json:"per_page"` // 每页数量
	Status  string `json:"status"`   // 状态过滤
	Keyword string `json:"keyword"`  // 关键词搜索
	SortBy  string `json:"sort_by"`  // 排序字段
	Order   string `json:"order"`    // 排序方向
}

// FileStatsResponse 文件统计响应
type FileStatsResponse struct {
	TotalCount       int64   `json:"total_count"`        // 总文件数
	CompletedCount   int64   `json:"completed_count"`    // 已完成文件数
	TotalSize        int64   `json:"total_size"`         // 总文件大小
	TodayUploadCount int64   `json:"today_upload_count"` // 今日上传数量
	SuccessRate      float64 `json:"success_rate"`       // 成功率
	AverageFileSize  float64 `json:"average_file_size"`  // 平均文件大小
}

// TodayUploadStatsResponse 今日上传统计响应
type TodayUploadStatsResponse struct {
	Count     int64 `json:"count"`      // 今日上传数量
	TotalSize int64 `json:"total_size"` // 今日上传总大小
}

// RecentFile 最近上传的文件
type RecentFile struct {
	UploadID  string    `json:"upload_id"`  // 上传任务ID
	FileName  string    `json:"file_name"`  // 文件名
	FileSize  int64     `json:"file_size"`  // 文件大小
	Status    string    `json:"status"`     // 状态
	CreatedAt time.Time `json:"created_at"` // 创建时间
	UpdatedAt time.Time `json:"updated_at"` // 更新时间
}

// RecentFilesResponse 最近文件响应
type RecentFilesResponse struct {
	Files []*RecentFile `json:"files"` // 最近文件列表
}

// 常量定义
const (
	StatusInProgress = "in_progress" // 上传中状态
	StatusCompleted  = "completed"   // 已完成状态
	StatusFailed     = "failed"      // 失败状态

	DefaultPage    = 1   // 默认页码
	DefaultPerPage = 20  // 默认每页数量
	MaxPerPage     = 100 // 最大每页数量
)

// GetFileStats 获取文件统计信息
// GET /api/v1/files/stats
func GetFileStats(w http.ResponseWriter, r *http.Request) {
	var stats FileStatsResponse

	// 获取总文件数
	err := db.QueryRow("SELECT COUNT(*) FROM uploads").Scan(&stats.TotalCount)
	if err != nil {
		log.Printf("Get total count error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取总文件数失败")
		return
	}

	// 获取已完成文件数
	err = db.QueryRow("SELECT COUNT(*) FROM uploads WHERE status = ?", StatusCompleted).Scan(&stats.CompletedCount)
	if err != nil {
		log.Printf("Get completed count error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取已完成文件数失败")
		return
	}

	// 获取总文件大小
	err = db.QueryRow("SELECT COALESCE(SUM(total_size), 0) FROM uploads WHERE status = ?", StatusCompleted).Scan(&stats.TotalSize)
	if err != nil {
		log.Printf("Get total size error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取总文件大小失败")
		return
	}

	// 获取今日上传数量
	today := time.Now().Format("2006-01-02")
	err = db.QueryRow("SELECT COUNT(*) FROM uploads WHERE DATE(created_at) = ?", today).Scan(&stats.TodayUploadCount)
	if err != nil {
		log.Printf("Get today count error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取今日上传数量失败")
		return
	}

	// 计算成功率
	if stats.TotalCount > 0 {
		stats.SuccessRate = float64(stats.CompletedCount) / float64(stats.TotalCount) * 100
	} else {
		stats.SuccessRate = 0
	}

	// 计算平均文件大小
	if stats.CompletedCount > 0 {
		stats.AverageFileSize = float64(stats.TotalSize) / float64(stats.CompletedCount)
	} else {
		stats.AverageFileSize = 0
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data": stats,
	})
}

// GetTodayUploadStats 获取今日上传统计
// GET /api/v1/files/today-stats
func GetTodayUploadStats(w http.ResponseWriter, r *http.Request) {
	var stats TodayUploadStatsResponse

	// 获取今日上传的文件数量和总大小
	today := time.Now().Format("2006-01-02")
	query := `
		SELECT 
			COUNT(*) as count,
			COALESCE(SUM(total_size), 0) as total_size
		FROM uploads 
		WHERE DATE(created_at) = ? AND status = ?
	`

	err := db.QueryRow(query, today, StatusCompleted).Scan(&stats.Count, &stats.TotalSize)
	if err != nil {
		log.Printf("Get today stats error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取今日上传统计失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data": stats,
	})
}

// GetRecentFiles 获取最近上传的文件
// GET /api/v1/files/recent
func GetRecentFiles(w http.ResponseWriter, r *http.Request) {
	// 获取查询参数
	limitStr := r.URL.Query().Get("limit")
	limit := 5 // 默认值

	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 50 {
				l = 50 // 限制最大数量
			}
			limit = l
		}
	}

	// 查询最近的文件
	query := `
		SELECT 
			upload_id, file_name, total_size, status, created_at, updated_at
		FROM uploads 
		ORDER BY created_at DESC 
		LIMIT ?
	`

	rows, err := db.Query(query, limit)
	if err != nil {
		log.Printf("Get recent files error: %v", err)
		writeError(w, http.StatusInternalServerError, "获取最近文件失败")
		return
	}
	defer rows.Close()

	var files []*RecentFile
	for rows.Next() {
		file := &RecentFile{}
		err := rows.Scan(
			&file.UploadID,
			&file.FileName,
			&file.FileSize,
			&file.Status,
			&file.CreatedAt,
			&file.UpdatedAt,
		)
		if err != nil {
			log.Printf("Scan recent file error: %v", err)
			continue
		}
		files = append(files, file)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows error: %v", err)
		writeError(w, http.StatusInternalServerError, "处理文件数据失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data": files,
	})
}

// 辅助函数

// getUploadLock 获取或创建上传任务的互斥锁
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

// writeJSON 写入JSON响应
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError 写入错误响应
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{
		Error:   http.StatusText(status),
		Code:    status,
		Message: message,
	})
}

// parseQueryParams 解析查询参数
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

// initDB 初始化数据库连接
func initDB(dsn string) error {
	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	db.SetConnMaxLifetime(time.Minute * 3) // 连接最大生命周期
	db.SetMaxOpenConns(10)                 // 最大打开连接数
	db.SetMaxIdleConns(10)                 // 最大空闲连接数
	return db.Ping()                       // 测试连接
}

// 处理器函数

// CreateUpload 创建上传任务
// POST /api/v1/uploads
func CreateUpload(w http.ResponseWriter, r *http.Request) {
	var req UploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// 验证必需字段
	if req.FileName == "" || req.TotalSize <= 0 || req.ChunkSize <= 0 {
		writeError(w, http.StatusBadRequest, "Missing or invalid required fields: file_name, total_size, chunk_size")
		return
	}

	// 计算总分片数
	totalChunks := int((req.TotalSize + int64(req.ChunkSize) - 1) / int64(req.ChunkSize))
	uploadID := uuid.New().String() // 生成唯一上传ID

	// 插入数据库记录
	_, err := db.Exec(
		"INSERT INTO uploads (upload_id, file_name, total_size, chunk_size, total_chunks, status) VALUES (?, ?, ?, ?, ?, ?)",
		uploadID, req.FileName, req.TotalSize, req.ChunkSize, totalChunks, StatusInProgress,
	)
	if err != nil {
		log.Println("Database insert upload error:", err)
		writeError(w, http.StatusInternalServerError, "Failed to create upload task")
		return
	}

	// 创建临时目录存储分片
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

	// 解析分片索引
	index, err := strconv.Atoi(indexStr)
	if err != nil || index < 0 {
		writeError(w, http.StatusBadRequest, "Invalid chunk index")
		return
	}

	// 获取上传任务信息
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

	// 验证状态
	if status != StatusInProgress {
		writeError(w, http.StatusBadRequest, "Upload is not in progress")
		return
	}

	// 验证分片索引范围
	if index >= totalChunks {
		writeError(w, http.StatusBadRequest, "Chunk index out of range")
		return
	}

	// 创建临时目录
	tmpPath := filepath.Join(tmpDir, uploadID)
	_ = os.MkdirAll(tmpPath, 0755)
	chunkPath := filepath.Join(tmpPath, fmt.Sprintf("chunk_%06d", index))

	// 创建临时文件
	tmpFile, err := os.Create(chunkPath + ".part")
	if err != nil {
		log.Println("Create chunk file error:", err)
		writeError(w, http.StatusInternalServerError, "Server error")
		return
	}
	defer tmpFile.Close()

	// 读取并写入分片数据，同时计算MD5
	hasher := md5.New()
	mw := io.MultiWriter(tmpFile, hasher) // 多写器：同时写入文件和计算哈希
	n, err := io.Copy(mw, r.Body)
	if err != nil {
		log.Println("Write chunk error:", err)
		writeError(w, http.StatusInternalServerError, "Write error")
		return
	}
	tmpFile.Close()

	chunkMD5 := hex.EncodeToString(hasher.Sum(nil))

	// 原子性重命名临时文件
	if err := os.Rename(chunkPath+".part", chunkPath); err != nil {
		log.Println("Rename chunk file error:", err)
		writeError(w, http.StatusInternalServerError, "Server error")
		return
	}

	// 保存分片元数据到数据库
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

	// 获取上传基本信息
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

	// 获取已上传的分片
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

	// 构建响应
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
	lock.Lock()         // 加锁防止并发完成
	defer lock.Unlock() // 确保解锁

	// 获取上传元数据
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

	// 检查是否已完成
	if status == StatusCompleted {
		writeError(w, http.StatusBadRequest, "Upload already completed")
		return
	}

	// 查找并验证分片
	chunkFiles, missing, err := findAndValidateChunks(uploadID, totalChunks)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 检查是否有缺失分片
	if len(missing) > 0 {
		msg := fmt.Sprintf("Missing chunks: %v (found %d, expected %d)", missing, len(chunkFiles), totalChunks)
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	// 合并分片
	finalPath, fileSize, fileMD5, err := mergeChunks(uploadID, fileName, chunkFiles)
	if err != nil {
		log.Println("Merge chunks error:", err)
		writeError(w, http.StatusInternalServerError, "Failed to merge chunks")
		return
	}

	// 更新数据库状态
	_, err = db.Exec(
		"UPDATE uploads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?",
		StatusCompleted, uploadID,
	)
	if err != nil {
		log.Println("Database update upload error:", err)
		// 非致命错误：不影响客户端响应
	}

	// 异步清理临时分片
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

	// 构建WHERE条件
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

// 辅助函数

// getFileByUploadID 根据上传ID获取文件记录
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

	// 为已完成文件设置完成时间
	if file.Status == StatusCompleted {
		file.CompletedAt = &file.UpdatedAt
	}

	return file, nil
}

// findAndValidateChunks 查找并验证分片
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

	// 解析和验证分片索引
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
			// 尝试不修剪零的解析
			index, err = strconv.Atoi(strings.TrimPrefix(base, "chunk_"))
			if err != nil {
				log.Printf("Parse chunk index failed for %s: %v\n", file, err)
				continue
			}
		}
		indices[index] = file
	}

	// 检查缺失的分片
	var missing []int
	for i := 0; i < totalChunks; i++ {
		if _, exists := indices[i]; !exists {
			missing = append(missing, i)
		}
	}

	// 按索引排序文件
	var sortedFiles []string
	for i := 0; i < totalChunks; i++ {
		if file, exists := indices[i]; exists {
			sortedFiles = append(sortedFiles, file)
		}
	}

	return sortedFiles, missing, nil
}

// mergeChunks 合并分片
func mergeChunks(uploadID, fileName string, chunkFiles []string) (string, int64, string, error) {
	// 构建最终文件路径
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

	// 按顺序合并所有分片
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

		// 为大文件记录进度
		if i%50 == 0 {
			log.Printf("Merging upload %s: chunk %d/%d, written %d bytes\n", 
				uploadID, i+1, len(chunkFiles), totalWritten)
		}
	}

	if err := out.Close(); err != nil {
		return "", 0, "", err
	}

	// 重命名为最终路径
	if err := os.Rename(tmpFinalPath, finalPath); err != nil {
		return "", 0, "", err
	}

	fileMD5 := hex.EncodeToString(hasher.Sum(nil))
	return finalPath, totalWritten, fileMD5, nil
}

// cleanupChunks 清理临时分片
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

// main 主函数
func main() {
	// 确保目录存在
	_ = os.MkdirAll(tmpDir, 0755)
	_ = os.MkdirAll(finalDir, 0755)

	// 连接数据库
	dsn := "root:root@tcp(127.0.0.1:3306)/filedb?parseTime=true"
	if err := initDB(dsn); err != nil {
		log.Fatal("Database initialization failed:", err)
	}

	// 初始化路由器
	r := mux.NewRouter()

	// API路由
	api := r.PathPrefix("/api/v1").Subrouter()
	
	// 上传路由
	uploads := api.PathPrefix("/uploads").Subrouter()
	uploads.HandleFunc("", CreateUpload).Methods("POST")
	uploads.HandleFunc("/{upload_id}", GetUploadStatus).Methods("GET")
	uploads.HandleFunc("/{upload_id}/complete", CompleteUpload).Methods("POST")
	uploads.HandleFunc("/{upload_id}/chunks/{index}", UploadChunk).Methods("PUT", "POST")

	// 文件历史路由
	files := api.PathPrefix("/files").Subrouter()
	files.HandleFunc("/history", GetFileHistory).Methods("GET")

	// 新增统计路由
	files.HandleFunc("/stats", GetFileStats).Methods("GET")
	files.HandleFunc("/today-stats", GetTodayUploadStats).Methods("GET")
	files.HandleFunc("/recent", GetRecentFiles).Methods("GET")

	// 系统路由
	api.HandleFunc("/health", HealthCheck).Methods("GET")

	files.HandleFunc("/{upload_id}", GetFileDetail).Methods("GET")

	// 配置CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // 允许所有源
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           86400, // 预检请求缓存时间
	})

	// 启动服务器
	srv := &http.Server{
		Addr:         ":8080",
		Handler:      c.Handler(r),
		ReadTimeout:  30 * time.Minute, // 长超时以适应大文件上传
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
	log.Println("  GET    /api/v1/files/stats")           // 新增
	log.Println("  GET    /api/v1/files/today-stats")     // 新增
	log.Println("  GET    /api/v1/files/recent")          // 新增
	log.Println("  GET    /api/v1/health")

	log.Fatal(srv.ListenAndServe())
}