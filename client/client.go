// client_upload.go (示例片段)
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

func initUpload(server string, fileName string, totalSize int64, chunkSize int) (string, int, error) {
	body := map[string]interface{}{
		"file_name":  fileName,
		"total_size": totalSize,
		"chunk_size": chunkSize,
	}
	b, _ := json.Marshal(body)
	resp, err := http.Post(server+"/upload/init", "application/json", bytes.NewReader(b))
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	var j map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&j)
	return j["upload_id"].(string), int(j["chunk_size"].(float64)), nil
}

func uploadChunk(server, uploadID string, idx int, data []byte) error {
	url := fmt.Sprintf("%s/upload/%s/chunk?index=%d", server, uploadID, idx)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error: %s", string(b))
	}
	return nil
}

func main() {
	server := "http://localhost:8080"
	fpath := "test.zip"
	f, _ := os.Open(fpath)
	fi, _ := f.Stat()
	uploadID, chunkSize, _ := initUpload(server, fi.Name(), fi.Size(), 4*1024*1024) // 4MB
	fmt.Println("uploadID", uploadID)
	buf := make([]byte, chunkSize)
	i := 0
	for {
		n, err := f.Read(buf)
		if n > 0 {
			if err := uploadChunk(server, uploadID, i, buf[:n]); err != nil {
				fmt.Println("upload chunk err", err)
				return
			}
			fmt.Println("uploaded chunk", i)
			i++
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Println("read err", err)
			return
		}
	}
	// 完成合并
	resp, _ := http.Post(fmt.Sprintf("%s/upload/%s/complete", server, uploadID), "application/json", nil)
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	fmt.Println("complete resp:", string(b))
}
