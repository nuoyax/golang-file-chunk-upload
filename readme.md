<h1 align="center">文件上传服务</h1>

[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](https://golang.org/) 
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/) 
[![Gorilla Mux](https://img.shields.io/badge/Gorilla_Mux-000000?logo=go&logoColor=white)](https://github.com/gorilla/mux) 
[![rs/cors](https://img.shields.io/badge/rs/cors-000000?logo=go&logoColor=white)](https://github.com/rs/cors) 
[![go-sql-driver/mysql](https://img.shields.io/badge/go--sql--driver/mysql-000000?logo=mysql&logoColor=white)](https://github.com/go-sql-driver/mysql)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![WeChat](https://img.shields.io/badge/WeChat-07C160?logo=wechat&logoColor=white)](你的微信链接)




一个用 Go 语言编写的强大且可扩展的文件上传服务，旨在通过分片上传处理大文件上传，支持断点续传、进度跟踪和文件历史管理。服务使用 MySQL 数据库存储元数据，并提供 RESTful API 用于创建上传任务、上传分片、检查上传状态以及获取文件历史和统计信息。

## 功能特性
- **分片文件上传**：通过将文件分解为较小的分片支持大文件上传，实现断点续传。
- **进度跟踪**：通过 API 端点提供实时上传进度和状态。
- **文件历史**：支持分页、过滤和排序的文件上传历史记录查询。
- **统计信息**：提供上传指标的洞察，包括总文件数、已完成上传数和每日统计。
- **并发上传处理**：使用互斥锁安全管理并发上传。
- **CORS 支持**：支持可配置的跨源资源共享，适用于 Web 应用。
- **健康检查**：提供健康检查端点用于监控服务状态。

## 技术栈
- **Go**：后端主要编程语言，用于构建高效的服务。
- **MySQL**：用于存储上传元数据的数据库。
- **Gorilla Mux**：处理 API 路由的 HTTP 路由器。
- **rs/cors**：提供跨源资源共享（CORS）支持。
- **go-sql-driver/mysql**：MySQL 数据库驱动。

## 安装与设置
1. **克隆项目**：
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **安装依赖**：
   ```bash
   go mod tidy
   ```

3. **配置数据库**：
   - 确保 MySQL 服务正在运行。
   - 创建数据库 `filedb` 并执行以下 SQL 创建必要的表：
     ```sql
     CREATE DATABASE filedb;
     USE filedb;

     CREATE TABLE uploads (
         upload_id VARCHAR(36) PRIMARY KEY,
         file_name VARCHAR(255) NOT NULL,
         total_size BIGINT NOT NULL,
         chunk_size INT NOT NULL,
         total_chunks INT NOT NULL,
         status ENUM('in_progress', 'completed', 'failed') NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     );

     CREATE TABLE upload_chunks (
         upload_id VARCHAR(36),
         chunk_index INT,
         chunk_size BIGINT NOT NULL,
         chunk_md5 VARCHAR(32) NOT NULL,
         received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (upload_id, chunk_index),
         FOREIGN KEY (upload_id) REFERENCES uploads(upload_id)
     );
     ```

4. **配置环境**：
   - 确保 `tmp_uploads` 和 `store` 目录具有写权限。
   - 更新 `main.go` 中的数据库连接字符串（DSN）以匹配您的 MySQL 配置：
     ```go
     dsn := "root:root@tcp(127.0.0.1:3306)/filedb?parseTime=true"
     ```

5. **运行服务**：
   ```bash
   go run main.go
   ```

## API 端点
- **POST /api/v1/uploads**：创建新的上传任务。
- **GET /api/v1/uploads/{upload_id}**：获取上传任务状态。
- **POST /api/v1/uploads/{upload_id}/complete**：完成上传任务并合并分片。
- **PUT /api/v1/uploads/{upload_id}/chunks/{index}**：上传文件分片。
- **GET /api/v1/files/history**：获取文件上传历史记录。
- **GET /api/v1/files/{upload_id}**：获取文件详情。
- **GET /api/v1/files/stats**：获取文件上传统计信息。
- **GET /api/v1/files/today-stats**：获取今日上传统计。
- **GET /api/v1/files/recent**：获取最近上传的文件。
- **GET /api/v1/health**：服务健康检查。

## 使用示例
### 创建上传任务
```bash
curl -X POST http://localhost:8080/api/v1/uploads \
-H "Content-Type: application/json" \
-d '{"file_name":"example.txt","total_size":1048576,"chunk_size":262144}'
```

### 上传分片
```bash
curl -X PUT http://localhost:8080/api/v1/uploads/{upload_id}/chunks/0 \
-H "Content-Type: application/octet-stream" \
--data-binary @chunk_0
```

### 获取上传状态
```bash
curl http://localhost:8080/api/v1/uploads/{upload_id}
```

### 完成上传
```bash
curl -X POST http://localhost:8080/api/v1/uploads/{upload_id}/complete
```

## 注意事项
- 确保 MySQL 数据库已正确配置并运行。
- 服务默认监听在 `:8080` 端口，可根据需要修改 `main.go` 中的 `srv.Addr`。
- 上传的文件分片存储在 `tmp_uploads` 目录，合并后的文件存储在 `store` 目录。
- 服务支持 CORS，允许跨域请求，适合前端应用集成。

## 许可证
MIT License