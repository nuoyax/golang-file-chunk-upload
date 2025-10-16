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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

var (
	db            *sql.DB
	tmpDir        = "./tmp_uploads"
	finalDir      = "./store"
	uploadLocks   = make(map[string]*sync.Mutex)
	uploadLocksMu sync.Mutex
)

// helper to get per-upload mutex (single-instance safe)
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

type InitRequest struct {
	FileName  string `json:"file_name"`
	TotalSize int64  `json:"total_size"`
	ChunkSize int    `json:"chunk_size"`
	// optional client-provided overall checksum
	MD5 string `json:"md5,omitempty"`
}

type InitResponse struct {
	UploadID    string `json:"upload_id"`
	ChunkSize   int    `json:"chunk_size"`
	TotalChunks int    `json:"total_chunks"`
}

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

// POST /upload/init
func handleInit(w http.ResponseWriter, r *http.Request) {
	var req InitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.FileName == "" || req.TotalSize <= 0 || req.ChunkSize <= 0 {
		http.Error(w, "missing fields", http.StatusBadRequest)
		return
	}
	totalChunks := int((req.TotalSize + int64(req.ChunkSize) - 1) / int64(req.ChunkSize))
	uploadID := uuid.New().String()

	_, err := db.Exec(
		"INSERT INTO uploads (upload_id, file_name, total_size, chunk_size, total_chunks, status) VALUES (?, ?, ?, ?, ?, 'in_progress')",
		uploadID, req.FileName, req.TotalSize, req.ChunkSize, totalChunks,
	)
	if err != nil {
		log.Println("db insert upload error:", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// create tmp dir
	_ = os.MkdirAll(filepath.Join(tmpDir, uploadID), 0755)

	resp := InitResponse{
		UploadID:    uploadID,
		ChunkSize:   req.ChunkSize,
		TotalChunks: totalChunks,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// PUT /upload/{upload_id}/chunk?index=0
// form-data: file (binary) OR raw body
func handleUploadChunk(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	uploadID := vars["upload_id"]
	indexStr := r.URL.Query().Get("index")
	if indexStr == "" {
		http.Error(w, "index required", http.StatusBadRequest)
		return
	}
	index, err := strconv.Atoi(indexStr)
	if err != nil || index < 0 {
		http.Error(w, "invalid index", http.StatusBadRequest)
		return
	}

	// get upload info
	var chunkSize int
	var totalChunks int
	err = db.QueryRow("SELECT chunk_size, total_chunks FROM uploads WHERE upload_id = ?", uploadID).Scan(&chunkSize, &totalChunks)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "upload_id not found", http.StatusNotFound)
			return
		}
		log.Println("db query:", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if index >= totalChunks {
		http.Error(w, "index out of range", http.StatusBadRequest)
		return
	}

	// read body into temp file
	tmpPath := filepath.Join(tmpDir, uploadID)
	_ = os.MkdirAll(tmpPath, 0755)
	chunkPath := filepath.Join(tmpPath, fmt.Sprintf("chunk_%06d", index))
	tmpFile, err := os.Create(chunkPath + ".part")
	if err != nil {
		log.Println("create chunk file:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer tmpFile.Close()

	// read request body
	hasher := md5.New()
	mw := io.MultiWriter(tmpFile, hasher)
	n, err := io.Copy(mw, r.Body)
	if err != nil {
		log.Println("write chunk:", err)
		http.Error(w, "write error", http.StatusInternalServerError)
		return
	}
	_ = tmpFile.Close()

	chunkMD5 := hex.EncodeToString(hasher.Sum(nil))

	// atomically rename
	if err := os.Rename(chunkPath+".part", chunkPath); err != nil {
		log.Println("rename:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// insert or replace chunk record
	_, err = db.Exec(`
		INSERT INTO upload_chunks (upload_id, chunk_index, chunk_size, chunk_md5)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE chunk_size = VALUES(chunk_size), chunk_md5 = VALUES(chunk_md5), received_at = CURRENT_TIMESTAMP
	`, uploadID, index, n, chunkMD5)
	if err != nil {
		log.Println("db insert chunk:", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprintf(w, `{"index":%d,"size":%d,"md5":"%s"}`, index, n, chunkMD5)
}

// GET /upload/{upload_id}/status
// returns uploaded chunk indices
func handleStatus(w http.ResponseWriter, r *http.Request) {
	uploadID := mux.Vars(r)["upload_id"]
	rows, err := db.Query("SELECT chunk_index FROM upload_chunks WHERE upload_id = ?", uploadID)
	if err != nil {
		log.Println("db query chunks:", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var indices []int
	for rows.Next() {
		var idx int
		rows.Scan(&idx)
		indices = append(indices, idx)
	}
	resp := map[string]interface{}{
		"upload_id": uploadID,
		"chunks":    indices,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /upload/{upload_id}/complete
// 替换整个 handleComplete 实现
func handleComplete(w http.ResponseWriter, r *http.Request) {
	uploadID := mux.Vars(r)["upload_id"]
	lock := getUploadLock(uploadID)
	lock.Lock()
	defer lock.Unlock()

	// fetch upload metadata
	var fileName string
	var totalSize int64
	var chunkSize int
	var totalChunks int
	var status string
	err := db.QueryRow("SELECT file_name, total_size, chunk_size, total_chunks, status FROM uploads WHERE upload_id = ?", uploadID).
		Scan(&fileName, &totalSize, &chunkSize, &totalChunks, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		log.Println("db read upload:", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if status == "completed" {
		http.Error(w, "already completed", http.StatusBadRequest)
		return
	}

	// tmp path where chunks are stored
	tmpPath := filepath.Join(tmpDir, uploadID)
	// list chunk files on disk
	pattern := filepath.Join(tmpPath, "chunk_*")
	files, err := filepath.Glob(pattern)
	if err != nil {
		log.Println("glob chunks error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if len(files) == 0 {
		log.Printf("no chunk files found for uploadID=%s under %s\n", uploadID, tmpPath)
		http.Error(w, "no chunks found", http.StatusBadRequest)
		return
	}

	// parse indices and sort
	type part struct {
		path  string
		index int
	}
	parts := make([]part, 0, len(files))
	for _, p := range files {
		base := filepath.Base(p) // chunk_000000
		// 支持你的命名格式 "chunk_%06d"
		// 去掉前缀 "chunk_"
		if !strings.HasPrefix(base, "chunk_") {
			continue
		}
		idxStr := strings.TrimPrefix(base, "chunk_")
		// 如果你以前是没有零填充的（如 chunk_0），下面仍能解析
		idxStr = strings.TrimLeft(idxStr, "0")
		if idxStr == "" {
			// 全零的情况 -> index 0
			parts = append(parts, part{path: p, index: 0})
			continue
		}
		i, err := strconv.Atoi(idxStr)
		if err != nil {
			// 兼容：如果文件名没有去掉前导 0 导致解析出错，尝试按全部字符串解析
			i, err = strconv.Atoi(strings.TrimPrefix(filepath.Base(p), "chunk_"))
			if err != nil {
				log.Println("parse chunk index failed for", p, "err:", err)
				continue
			}
		}
		parts = append(parts, part{path: p, index: i})
	}

	if len(parts) == 0 {
		log.Printf("no parsable chunk files for uploadID=%s\n", uploadID)
		http.Error(w, "no valid chunks found", http.StatusBadRequest)
		return
	}

	// sort by index
	sort.Slice(parts, func(i, j int) bool { return parts[i].index < parts[j].index })

	// detect missing indices (based on expected totalChunks from DB)
	missing := []int{}
	seen := make(map[int]bool, len(parts))
	for _, p := range parts {
		seen[p.index] = true
	}
	for i := 0; i < totalChunks; i++ {
		if !seen[i] {
			missing = append(missing, i)
		}
	}
	if len(missing) > 0 {
		msg := fmt.Sprintf("missing chunks: %v (found %d on disk, expected %d)", missing, len(parts), totalChunks)
		log.Printf("uploadID=%s: %s\n", uploadID, msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	// assemble to final file (.part -> rename)
	finalPath := filepath.Join(finalDir, fmt.Sprintf("%s_%s", uploadID, filepath.Base(fileName)))
	_ = os.MkdirAll(finalDir, 0755)
	outPathTmp := finalPath + ".part"
	out, err := os.Create(outPathTmp)
	if err != nil {
		log.Println("create final file:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// merge
	hasher := md5.New()
	totalWritten := int64(0)
	for _, p := range parts {
		f, err := os.Open(p.path)
		if err != nil {
			log.Println("open chunk:", p.path, err)
			out.Close()
			os.Remove(outPathTmp)
			http.Error(w, fmt.Sprintf("open chunk %d failed: %v", p.index, err), http.StatusInternalServerError)
			return
		}
		n, err := io.Copy(io.MultiWriter(out, hasher), f)
		f.Close()
		if err != nil {
			log.Println("copy chunk:", p.path, err)
			out.Close()
			os.Remove(outPathTmp)
			http.Error(w, fmt.Sprintf("read chunk %d failed: %v", p.index, err), http.StatusInternalServerError)
			return
		}
		totalWritten += n
		// optional: log progress occasionally
		if p.index%50 == 0 {
			log.Printf("merging uploadID=%s chunk=%d written=%d\n", uploadID, p.index, totalWritten)
		}
	}

	// close final output
	if err := out.Close(); err != nil {
		log.Println("close final file error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// size check
	fi, err := os.Stat(outPathTmp)
	if err == nil {
		if fi.Size() != totalSize {
			log.Printf("warning: assembled size %d != expected %d for uploadID=%s\n", fi.Size(), totalSize, uploadID)
			// 这里不强制失败，仅做警告（你可按需改为失败）
		}
	}

	// rename
	if err := os.Rename(outPathTmp, finalPath); err != nil {
		log.Println("rename final:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// update DB status
	_, err = db.Exec("UPDATE uploads SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?", uploadID)
	if err != nil {
		log.Println("db update upload:", err)
		// 非致命：不影响客户端成功返回
	}

	// async cleanup chunks
	go func() {
		_ = os.RemoveAll(tmpPath)
	}()

	log.Printf("uploadID=%s merged successfully -> %s (total %d bytes)\n", uploadID, finalPath, totalWritten)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":     "completed",
		"final_path": finalPath,
	})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(200)
	w.Write([]byte("OK"))
}

func main() {
	// ensure dirs
	_ = os.MkdirAll(tmpDir, 0755)
	_ = os.MkdirAll(finalDir, 0755)

	// connect DB (replace with your DSN)
	dsn := "root:root@tcp(127.0.0.1:3306)/filedb?parseTime=true"
	if err := initDB(dsn); err != nil {
		log.Fatal("db init failed:", err)
	}

	r := mux.NewRouter()
	r.HandleFunc("/health", handleHealth).Methods("GET")
	r.HandleFunc("/upload/init", handleInit).Methods("POST")
	r.HandleFunc("/upload/{upload_id}/chunk", handleUploadChunk).Methods("PUT", "POST")
	r.HandleFunc("/upload/{upload_id}/status", handleStatus).Methods("GET")
	r.HandleFunc("/upload/{upload_id}/complete", handleComplete).Methods("POST")

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      r,
		ReadTimeout:  30 * time.Minute,
		WriteTimeout: 30 * time.Minute,
	}
	log.Println("listening :8080")
	log.Fatal(srv.ListenAndServe())
}
