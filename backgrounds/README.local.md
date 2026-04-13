本目录用于本地壁纸资源。

- 不再纳入 Git 历史，避免再次触发 GitHub `pack exceeds maximum allowed size`。
- 运行时默认会读取仓库根目录下的 `backgrounds/`。
- 也可以通过 `BACKGROUND_LIBRARY_DIR` 环境变量改为任意本地目录。
