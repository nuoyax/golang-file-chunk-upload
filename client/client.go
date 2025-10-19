// client.go
package main

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 客户端配置
type ClientConfig struct {
	ServerURL string
	ChunkSize int
	Retries   int
}

// 上传任务
type UploadTask struct {
	UploadID    string
	FileName    string
	FileSize    int64
	ChunkSize   int
	TotalChunks int
	ServerURL   string
}

// 响应结构体
type UploadResponse struct {
	UploadID    string `json:"upload_id"`
	ChunkSize   int    `json:"chunk_size"`
	TotalChunks int    `json:"total_chunks"`
}

type ChunkUploadResponse struct {
	Index int    `json:"index"`
	Size  int64  `json:"size"`
	MD5   string `json:"md5"`
}

type CompleteResponse struct {
	Status    string `json:"status"`
	FinalPath string `json:"final_path"`
	FileSize  int64  `json:"file_size"`
	MD5       string `json:"md5"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type UploadStatusResponse struct {
	UploadID string `json:"upload_id"`
	Status   string `json:"status"`
	Chunks   []int  `json:"chunks"`
	Progress struct {
		Completed int `json:"completed"`
		Total     int `json:"total"`
		Percent   int `json:"percent"`
	} `json:"progress"`
}

// 全局变量
var (
	config = ClientConfig{
		ServerURL: "http://localhost:8080",
		ChunkSize: 4 * 1024 * 1024, // 4MB
		Retries:   3,
	}
)

// 创建上传任务
func createUpload(filePath string) (*UploadTask, error) {
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("无法读取文件: %v", err)
	}

	fileName := filepath.Base(filePath)
	fileSize := fileInfo.Size()

	// 准备请求
	reqBody := map[string]interface{}{
		"file_name":  fileName,
		"total_size": fileSize,
		"chunk_size": config.ChunkSize,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("JSON编码失败: %v", err)
	}

	// 发送请求
	resp, err := http.Post(config.ServerURL+"/api/v1/uploads", "application/json", bytes.NewReader(jsonData))
	if err != nil {
		return nil, fmt.Errorf("创建上传任务失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		var errorResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errorResp); err != nil {
			return nil, fmt.Errorf("服务器错误: %s", resp.Status)
		}
		return nil, fmt.Errorf("创建上传任务失败: %s", errorResp.Message)
	}

	var uploadResp UploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&uploadResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %v", err)
	}

	task := &UploadTask{
		UploadID:    uploadResp.UploadID,
		FileName:    fileName,
		FileSize:    fileSize,
		ChunkSize:   uploadResp.ChunkSize,
		TotalChunks: uploadResp.TotalChunks,
		ServerURL:   config.ServerURL,
	}

	return task, nil
}

// 上传分片
func uploadChunk(task *UploadTask, chunkIndex int, data []byte) error {
	url := fmt.Sprintf("%s/api/v1/uploads/%s/chunks/%d", task.ServerURL, task.UploadID, chunkIndex)

	// 重试机制
	var lastErr error
	for i := 0; i < config.Retries; i++ {
		req, err := http.NewRequest("PUT", url, bytes.NewReader(data))
		if err != nil {
			lastErr = err
			continue
		}

		req.Header.Set("Content-Type", "application/octet-stream")
		
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Second * time.Duration(i+1)) // 指数退避
			continue
		}

		if resp.StatusCode == http.StatusCreated {
			resp.Body.Close()
			return nil
		}

		// 处理错误响应
		if resp.StatusCode >= 400 {
			var errorResp ErrorResponse
			if err := json.NewDecoder(resp.Body).Decode(&errorResp); err == nil {
				lastErr = fmt.Errorf("上传分片失败: %s", errorResp.Message)
			} else {
				lastErr = fmt.Errorf("上传分片失败: %s", resp.Status)
			}
		}
		resp.Body.Close()

		if resp.StatusCode >= 500 { // 服务器错误才重试
			time.Sleep(time.Second * time.Duration(i+1))
			continue
		} else {
			break // 客户端错误不重试
		}
	}

	return lastErr
}

// 完成上传
func completeUpload(task *UploadTask) (*CompleteResponse, error) {
	url := fmt.Sprintf("%s/api/v1/uploads/%s/complete", task.ServerURL, task.UploadID)

	resp, err := http.Post(url, "application/json", nil)
	if err != nil {
		return nil, fmt.Errorf("完成上传请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errorResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errorResp); err != nil {
			return nil, fmt.Errorf("服务器错误: %s", resp.Status)
		}
		return nil, fmt.Errorf("完成上传失败: %s", errorResp.Message)
	}

	var completeResp CompleteResponse
	if err := json.NewDecoder(resp.Body).Decode(&completeResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %v", err)
	}

	return &completeResp, nil
}

// 获取上传状态
func getUploadStatus(task *UploadTask) (*UploadStatusResponse, error) {
	url := fmt.Sprintf("%s/api/v1/uploads/%s", task.ServerURL, task.UploadID)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("获取状态失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errorResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errorResp); err != nil {
			return nil, fmt.Errorf("服务器错误: %s", resp.Status)
		}
		return nil, fmt.Errorf("获取状态失败: %s", errorResp.Message)
	}

	var statusResp UploadStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&statusResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %v", err)
	}

	return &statusResp, nil
}

// 显示进度条
func showProgress(completed, total int) {
	if total == 0 {
		return
	}
	
	percent := float64(completed) / float64(total) * 100
	barWidth := 50
	completedWidth := int(float64(barWidth) * percent / 100)
	
	bar := strings.Repeat("=", completedWidth) + strings.Repeat(" ", barWidth-completedWidth)
	fmt.Printf("\r[%s] %.1f%% (%d/%d)", bar, percent, completed, total)
}

// 计算文件MD5
func calculateFileMD5(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

// 上传文件
func uploadFile(filePath string) error {
	// 检查文件是否存在
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return fmt.Errorf("文件不存在: %s", filePath)
	}

	fmt.Printf("开始上传文件: %s\n", filePath)

	// 创建上传任务
	task, err := createUpload(filePath)
	if err != nil {
		return err
	}

	fmt.Printf("创建上传任务成功: %s\n", task.UploadID)
	fmt.Printf("文件大小: %d bytes, 分片大小: %d bytes, 总分片数: %d\n", 
		task.FileSize, task.ChunkSize, task.TotalChunks)

	// 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("打开文件失败: %v", err)
	}
	defer file.Close()

	// 上传分片
	buffer := make([]byte, task.ChunkSize)
	successCount := 0

	for chunkIndex := 0; chunkIndex < task.TotalChunks; chunkIndex++ {
		// 读取分片数据
		n, err := file.Read(buffer)
		if err != nil && err != io.EOF {
			return fmt.Errorf("读取文件失败: %v", err)
		}

		if n == 0 {
			break
		}

		chunkData := buffer[:n]

		// 上传分片
		if err := uploadChunk(task, chunkIndex, chunkData); err != nil {
			return fmt.Errorf("上传分片 %d 失败: %v", chunkIndex, err)
		}

		successCount++
		fmt.Printf("\r已上传分片: %d/%d", successCount, task.TotalChunks)
	}

	fmt.Println("\n所有分片上传完成，正在合并文件...")

	// 完成上传
	completeResp, err := completeUpload(task)
	if err != nil {
		return err
	}

	fmt.Printf("文件上传成功!\n")
	fmt.Printf("最终路径: %s\n", completeResp.FinalPath)
	fmt.Printf("文件大小: %d bytes\n", completeResp.FileSize)
	if completeResp.MD5 != "" {
		fmt.Printf("文件MD5: %s\n", completeResp.MD5)
		
		// 验证本地文件MD5
		localMD5, err := calculateFileMD5(filePath)
		if err == nil && localMD5 == completeResp.MD5 {
			fmt.Printf("MD5校验: 匹配 ✓\n")
		} else if err == nil {
			fmt.Printf("MD5校验: 不匹配 ✗ (本地: %s, 服务器: %s)\n", localMD5, completeResp.MD5)
		}
	}

	return nil
}

// 查询上传状态
func queryStatus(uploadID string) error {
	task := &UploadTask{
		UploadID:  uploadID,
		ServerURL: config.ServerURL,
	}

	status, err := getUploadStatus(task)
	if err != nil {
		return err
	}

	fmt.Printf("上传任务状态:\n")
	fmt.Printf("  任务ID: %s\n", status.UploadID)
	fmt.Printf("  状态: %s\n", status.Status)
	fmt.Printf("  进度: %d/%d (%.1f%%)\n", 
		status.Progress.Completed, 
		status.Progress.Total, 
		float64(status.Progress.Completed)/float64(status.Progress.Total)*100)
	
	if len(status.Chunks) > 0 {
		fmt.Printf("  已上传分片: %v\n", status.Chunks)
	} else {
		fmt.Printf("  已上传分片: 无\n")
	}

	return nil
}

// 显示使用说明
func showUsage() {
	fmt.Println("文件上传客户端使用说明:")
	fmt.Println()
	fmt.Println("上传文件:")
	fmt.Println("  client upload <文件路径>")
	fmt.Println()
	fmt.Println("查询状态:")
	fmt.Println("  client status <上传ID>")
	fmt.Println()
	fmt.Println("选项:")
	fmt.Println("  -server string    服务器地址 (默认 \"http://localhost:8080\")")
	fmt.Println("  -chunk int        分片大小 (bytes) (默认 4194304)")
	fmt.Println("  -retries int      重试次数 (默认 3)")
	fmt.Println()
	fmt.Println("示例:")
	fmt.Println("  client upload ./largefile.zip")
	fmt.Println("  client status abc123-upload-id")
	fmt.Println("  client -server http://example.com:8080 upload ./file.txt")
}

func main() {
	// 解析命令行参数
	flag.StringVar(&config.ServerURL, "server", config.ServerURL, "服务器地址")
	flag.IntVar(&config.ChunkSize, "chunk", config.ChunkSize, "分片大小 (bytes)")
	flag.IntVar(&config.Retries, "retries", config.Retries, "重试次数")
	flag.Usage = showUsage
	flag.Parse()

	// 检查子命令
	args := flag.Args()
	if len(args) < 1 {
		showUsage()
		return
	}

	command := args[0]
	
	switch command {
	case "upload":
		if len(args) < 2 {
			fmt.Println("错误: 请指定要上传的文件路径")
			return
		}
		filePath := args[1]
		if err := uploadFile(filePath); err != nil {
			log.Fatalf("上传失败: %v", err)
		}

	case "status":
		if len(args) < 2 {
			fmt.Println("错误: 请指定上传ID")
			return
		}
		uploadID := args[1]
		if err := queryStatus(uploadID); err != nil {
			log.Fatalf("查询状态失败: %v", err)
		}

	default:
		fmt.Printf("未知命令: %s\n", command)
		showUsage()
	}
}