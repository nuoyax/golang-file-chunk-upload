Solution Overview (Key Points)

Upload Process:

The client calls POST /upload/init to submit file metadata (filename, size, chunksize, and optional md5 hash). The server returns an upload_id.

The client uploads chunks by chunkindex (starting at 0) to PUT /upload/{upload_id}/chunk, along with chunkindex, chunksize, and chunkmd5 hash (optional).

The client can call GET /upload/{upload_id}/status at any time to retrieve a list of uploaded chunks (for resuming uploads).

When all chunks have been uploaded, the client calls POST /upload/{upload_id}/complete. The server verifies, merges, and writes the chunks to the final storage, updating the status to completed.

Storage:

Temporary chunks are stored in tmp/{upload*id}/chunk*{index} (or can be uploaded directly to object storage).

After merging, write to store/{upload*id}*{filename} or upload to object storage.

Database (MySQL) Table:

uploads: Stores upload_id, filename, total_chunks, chunk_size, total_size, status, created_at, updated_at, etc.

upload_chunks (optional, used to record received chunks): upload_id, chunk_index, size, md5, received_at.

A bitset can also be used to store received chunks (implemented here as a table for easier querying).

Idempotence and Safety:

Duplicate uploads of the same chunk should be overwritten or ignored (based on the chunk file checksum).

The API must verify uploader permissions (authentication is omitted in the example; a token is required in practice).

Prevent directory traversal and control temporary directory permissions.

Concurrency/Locking:

Single instance: Use an in-memory mutex map to control concurrent merging of the same upload_id.

Multi-instance: Use Redis/etcd distributed locks or optimistic database locks.

Cleanup strategy:

Automatically clean up the disk and database for incomplete upload records exceeding the TTL (e.g., 7 days).

Production optimization suggestions:

Upload directly to S3/OSS (pre-signed URLs or multipart uploads), with merging only performed by the backend or S3 during the merge phase; this reduces traffic and I/O.

Use block checksums (MD5) to ensure integrity.

Use message queues to asynchronously merge/transcode files (merging large files may be slow).

Important Implementation Details and Notes

Resumable Upload: Before uploading, the client can call status to retrieve the index of existing chunks and skip them. The server records received chunks in the upload_chunks table (using UNIQUE (upload_id, chunk_index) to ensure idempotence).

Shard Verification: The client can calculate the MD5 of each chunk and send it to the server (in this example, the server calculates the MD5 itself and records it). The MD5 of the entire chunk can also be compared after merging (if provided during init).

Concurrent Upload: The client can upload multiple chunks in parallel. The server writes separate chunk files and uses ON DUPLICATE KEY UPDATE when inserting chunk records, allowing for retry safety.

Atomic Merge: Merges are written to .part and then renamed after completion to prevent incomplete files from being downloaded.

Exceptions/Retries: The client should retry if the upload fails (for example, with an exponential backoff of 5).

Note for large files: Merging requires disk IO; in production environments, prefer using multipart uploads with object storage (S3 multipart) to merge directly in the object storage.

Distributed: The example uploadLocks is a single-instance memory lock; for multiple instances, use Redis locks or database row locks to prevent multiple instances from merging the same upload simultaneously.

Security: For production environments, please implement authentication, rate limiting, flow control, path whitelisting, DDOS prevention, and verification of uploader permissions for upload_id.

Garbage removal: Implement a background task to clean up records with uploads.status = 'in_progress' and a created_at value exceeding the TTL, and delete the tmp folder.
