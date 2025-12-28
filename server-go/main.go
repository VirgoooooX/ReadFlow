// RSS 极简代理服务器 - Go 版本
//
// 功能：
// 1. /api/rss?url={feed_url} - 代理获取 RSS，替换图片 URL
// 2. /api/image?url={img_url} - 代理转发图片（流式，不存储）
// 3. /health - 健康检查

package main

import (
	"crypto/tls"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// 配置
var (
	port          string
	serverURL     string
	authToken     string
	activeRSSHub  = "https://rsshub.app"
	defaultRSSHub = "https://rsshub.app"
)

// RSSHub 实例列表
var rsshubInstances = []string{
	"https://rsshub.app",
	"https://rsshub.rssforever.com",
	"https://rss.198909.xyz:37891",
	"https://rsshub.speedcloud.one",
	"https://rsshub.pseudoyu.com",
}

// RSSHub 平台描述映射
var rsshubDescriptions = map[string]string{
	"techcrunch": "TechCrunch 科技新闻",
	"github":     "GitHub 仓库动态",
	"twitter":    "Twitter 用户动态",
	"weibo":      "微博用户动态",
	"bilibili":   "B站UP主动态",
	"zhihu":      "知乎专栏/用户动态",
	"juejin":     "掘金用户文章",
	"v2ex":       "V2EX 论坫",
	"sspai":      "少数派文章",
	"coolapk":    "酷安应用市场",
	"cnbeta":     "cnBeta 科技资讯",
}

// Referer 映射表 - 用于绕过防盗链
var refererMap = map[string]string{
	// 少数派 sspai
	"cdnfile.sspai.com": "https://sspai.com/",
	"cdn.sspai.com":     "https://sspai.com/",
	"sspai.com":         "https://sspai.com/",
	// 爱范儿 ifanr
	"s3.ifanr.com":    "https://www.ifanr.com/",
	"images.ifanr.cn": "https://www.ifanr.com/",
	"ifanr.com":       "https://www.ifanr.com/",
	// cnBeta
	"cnbetacdn.com":        "https://www.cnbeta.com.tw/",
	"static.cnbetacdn.com": "https://www.cnbeta.com.tw/",
	// Engadget / Yahoo
	"yimg.com":       "https://www.engadget.com/",
	"s.yimg.com":     "https://www.engadget.com/",
	"aolcdn.com":     "https://www.engadget.com/",
	"o.aolcdn.com":   "https://www.engadget.com/",
	"cloudfront.net": "https://www.engadget.com/",
	// Twitter
	"twimg.com":     "https://twitter.com/",
	"pbs.twimg.com": "https://twitter.com/",
	// Facebook/Instagram
	"fbcdn.net":        "https://www.facebook.com/",
	"cdninstagram.com": "https://www.instagram.com/",
	// Medium
	"medium.com":      "https://medium.com/",
	"miro.medium.com": "https://medium.com/",
	// Imgur
	"imgur.com":   "https://imgur.com/",
	"i.imgur.com": "https://imgur.com/",
	// WordPress
	"wp.com":    "https://wordpress.com/",
	"i0.wp.com": "https://wordpress.com/",
	"i1.wp.com": "https://wordpress.com/",
	"i2.wp.com": "https://wordpress.com/",
	// GitHub
	"githubusercontent.com":     "https://github.com/",
	"raw.githubusercontent.com": "https://github.com/",
	// Unsplash
	"unsplash.com":        "https://unsplash.com/",
	"images.unsplash.com": "https://unsplash.com/",
	// Flickr
	"staticflickr.com": "https://www.flickr.com/",
	// Giphy
	"giphy.com":       "https://giphy.com/",
	"media.giphy.com": "https://giphy.com/",
	// Reddit
	"redd.it":         "https://www.reddit.com/",
	"i.redd.it":       "https://www.reddit.com/",
	"preview.redd.it": "https://www.reddit.com/",
}

// 图片扩展名正则（新增 avif 格式支持）
var imageExtRegex = regexp.MustCompile(`(?i)\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?.*)?$`)

// 图片 CDN 域名列表
var imageCdnHosts = []string{
	"cdnfile.sspai.com", "cdn.sspai.com", // 少数派
	"s3.ifanr.com", "images.ifanr.cn", // 爱范儿
	"s.yimg.com", "techcrunch.com", "engadget.com", "cloudfront.net",
	"amazonaws.com", "gstatic.com", "googleapis.com", "o.aolcdn.com",
	"wp.com", "staticflickr.com", "imgur.com", "imgix.net", "twimg.com",
	"fbcdn.net", "cdninstagram.com", "medium.com", "unsplash.com",
}

// testRSSHubInstance 测试 RSSHub 实例是否可用
func testRSSHubInstance(instanceURL string) bool {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}
	resp, err := client.Head(instanceURL + "/")
	if err != nil {
		log.Printf("[RSSHub] Instance %s is not available: %v", instanceURL, err)
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// selectBestRSSHubInstance 自动选择最佳的 RSSHub 实例
func selectBestRSSHubInstance() string {
	for _, instance := range rsshubInstances {
		if testRSSHubInstance(instance) {
			activeRSSHub = instance
			return instance
		}
	}
	log.Printf("[RSSHub] No instances are available, using default: %s", defaultRSSHub)
	activeRSSHub = defaultRSSHub
	return defaultRSSHub
}

func init() {
	port = getEnv("PORT", "3000")
	serverURL = getEnv("SERVER_URL", "http://localhost:"+port)
	authToken = getEnv("AUTH_TOKEN", "")

	// 异步选择最佳 RSSHub 实例，避免阻塞启动
	go selectBestRSSHubInstance()
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// decodeHtmlEntities 解码 HTML 实体
func decodeHtmlEntities(s string) string {
	// 先用标准库处理
	decoded := html.UnescapeString(s)
	return decoded
}

// getReferer 根据域名获取合适的 Referer
func getReferer(targetURL string) string {
	u, err := url.Parse(targetURL)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Host)

	// 精确匹配
	if ref, ok := refererMap[host]; ok {
		return ref
	}

	// 部分匹配
	for domain, referer := range refererMap {
		if strings.HasSuffix(host, domain) || strings.Contains(host, domain) {
			return referer
		}
	}

	// 默认使用目标域名
	return u.Scheme + "://" + u.Host + "/"
}

// shouldProxyURL 判断 URL 是否需要代理
func shouldProxyURL(imgURL string) bool {
	if imgURL == "" || strings.HasPrefix(imgURL, "data:") {
		return false
	}
	if strings.Contains(imgURL, serverURL) || strings.Contains(imgURL, "/api/image?url=") {
		return false
	}
	if imageExtRegex.MatchString(imgURL) {
		return true
	}
	imgLower := strings.ToLower(imgURL)
	for _, cdn := range imageCdnHosts {
		if strings.Contains(imgLower, cdn) {
			return true
		}
	}
	return false
}

// replaceImageURLs 替换 XML 中的图片 URL
func replaceImageURLs(content string) string {
	// 匹配所有图片相关的属性
	patterns := []string{
		// HTML img 标签的各种属性
		`(<img[^>]*?\s(?:src|data-src|data-original|data-lazy-src)=["'])([^"']+)(["'])`,
		// enclosure 标签
		`(<enclosure[^>]*?\surl=["'])([^"']+)(["'])`,
		// media:content 和 media:thumbnail
		`(<media:(?:content|thumbnail)[^>]*?\surl=["'])([^"']+)(["'])`,
		// srcset 中的 URL（简化处理）
		`(srcset=["'])([^"']+)(["'])`,
		// 背景图片
		`(background(?:-image)?:\s*url\(['"]?)([^'"\)\s]+)(['"]?\))`,
		// 【新增】HTML 实体编码的 img 标签: &lt;img ... src=&quot;...&quot;&gt;
		// 支持多属性情况（如 sizes, srcset, src）
		`(&lt;img[^>]*?src=&quot;)([^&]+(?:&amp;[^&]+)*)(&quot;)`,
		// 【新增】HTML 实体编码的 srcset 属性
		`(srcset=&quot;)([^&]+(?:&amp;[^&]+)*)(&quot;)`,
	}

	result := content

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		result = re.ReplaceAllStringFunc(result, func(match string) string {
			submatches := re.FindStringSubmatch(match)
			if len(submatches) < 4 {
				return match
			}

			prefix := submatches[1]
			imgURL := submatches[2]
			suffix := submatches[3]

			// 解码 HTML 实体
			imgURL = decodeHtmlEntities(imgURL)

			// 处理 srcset（可能包含多个 URL）
			if strings.Contains(prefix, "srcset") {
				parts := strings.Split(imgURL, ",")
				var newParts []string
				for _, part := range parts {
					part = strings.TrimSpace(part)
					fields := strings.Fields(part)
					if len(fields) > 0 && shouldProxyURL(fields[0]) {
						fields[0] = serverURL + "/api/image?url=" + url.QueryEscape(fields[0])
					}
					newParts = append(newParts, strings.Join(fields, " "))
				}
				return prefix + strings.Join(newParts, ", ") + suffix
			}

			// 普通 URL 替换
			if shouldProxyURL(imgURL) {
				proxyURL := serverURL + "/api/image?url=" + url.QueryEscape(imgURL)
				return prefix + proxyURL + suffix
			}

			return match
		})
	}

	return result
}

// fixRelativeImageURLs 修复 XML 中的相对路径图片链接
// 从 RSS 源 URL 中提取 origin（协议+域名）并补全所有相对路径
func fixRelativeImageURLs(content string, feedURL string) string {
	// 解析 feedURL 提取 origin
	parsedURL, err := url.Parse(feedURL)
	if err != nil {
		log.Printf("[fixRelativeImageURLs] Failed to parse feedURL: %v", err)
		return content
	}

	origin := parsedURL.Scheme + "://" + parsedURL.Host
	log.Printf("[fixRelativeImageURLs] Origin: %s", origin)

	// 匹配相对路径图片的模式
	patterns := []struct {
		pattern string
		desc    string
	}{
		// src="/..." 形式
		{`(src=)(["'])(/[^"']+)(["'])`, "src=\"/...\""},
		// data-src="/..." 等懒加载属性
		{`(data-[\w-]+=)(["'])(/[^"']+)(["'])`, "data-*=\"/...\""},
		// HTML 实体编码形式: src=&quot;/...&quot;
		{`(src=&quot;)(/[^&]+)(&quot;)`, "src=&quot;/...&quot;"},
		// enclosure url="/..."
		{`(url=)(["'])(/[^"']+)(["'])`, "url=\"/...\""},
	}

	result := content

	for _, p := range patterns {
		re := regexp.MustCompile(p.pattern)
		result = re.ReplaceAllStringFunc(result, func(match string) string {
			submatches := re.FindStringSubmatch(match)
			if len(submatches) < 4 {
				return match
			}

			// 根据不同格式提取组件
			var attrPrefix, quote1, path, quote2 string
			if len(submatches) == 5 {
				// 标准格式: attr=" /path "
				attrPrefix = submatches[1]
				quote1 = submatches[2]
				path = submatches[3]
				quote2 = submatches[4]
			} else {
				// HTML实体格式: src=&quot; /path &quot;
				attrPrefix = submatches[1]
				path = submatches[2]
				quote2 = submatches[3]
				quote1 = ""
			}

			// 补全为绝对路径
			fixedURL := origin + path
			log.Printf("[fixRelativeImageURLs] Fixed: %s -> %s", match, fixedURL)

			return attrPrefix + quote1 + fixedURL + quote2
		})
	}

	return result
}

// validateToken 验证 Token
func validateToken(r *http.Request) bool {
	if authToken == "" {
		return true
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return false
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return false
	}
	return parts[1] == authToken
}

// sendJSON 发送 JSON 响应
func sendJSON(w http.ResponseWriter, statusCode int, data map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(statusCode)

	var parts []string
	for k, v := range data {
		switch val := v.(type) {
		case string:
			parts = append(parts, fmt.Sprintf(`"%s":"%s"`, k, val))
		case int:
			parts = append(parts, fmt.Sprintf(`"%s":%d`, k, val))
		case bool:
			parts = append(parts, fmt.Sprintf(`"%s":%t`, k, val))
		default:
			parts = append(parts, fmt.Sprintf(`"%s":"%v"`, k, val))
		}
	}
	fmt.Fprintf(w, "{%s}", strings.Join(parts, ","))
}

// isRSSHubURL 检查是否为 RSSHub 协议
func isRSSHubURL(u string) bool {
	return strings.HasPrefix(strings.ToLower(u), "rsshub://")
}

// validateRSSHubPath 验证 RSSHub 路径格式
func validateRSSHubPath(rsshubURL string) bool {
	if !isRSSHubURL(rsshubURL) {
		return false
	}

	path := rsshubURL[len("rsshub://"):]
	if path == "" || path == "/" {
		return false
	}

	// 检查是否包含有效字符
	validPathRegex := regexp.MustCompile(`^[a-zA-Z0-9\/._\%\?\&\=\+-]+$`)
	return validPathRegex.MatchString(path)
}

// convertRSSHubURL 将 rsshub:// 转换为 HTTP URL
func convertRSSHubURL(rsshubURL string) string {
	if !isRSSHubURL(rsshubURL) {
		return rsshubURL
	}

	path := rsshubURL[len("rsshub://"):]
	if path == "" || path == "/" {
		return defaultRSSHub
	}

	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	return activeRSSHub + path
}

// parseRSSHubURL 解析 RSSHub URL
func parseRSSHubURL(rsshubURL string) (platform, route, description string) {
	if !isRSSHubURL(rsshubURL) {
		return "", "", ""
	}

	path := strings.TrimPrefix(rsshubURL, "rsshub://")
	segments := strings.Split(path, "/")

	if len(segments) > 0 {
		platform = segments[0]
	}
	if len(segments) > 1 {
		route = strings.Join(segments[1:], "/")
	}

	desc, ok := rsshubDescriptions[platform]
	if !ok {
		desc = platform + " RSS源"
	}
	description = desc

	return platform, route, description
}

// handleRSS 处理 RSS 代理请求
func handleRSS(w http.ResponseWriter, r *http.Request) {
	// 从 RawQuery 手动提取 url 参数，避免自动解码导致的 & 截断问题
	rawQuery := r.URL.RawQuery
	feedURL := ""

	// 查找 url= 参数（取所有内容，不在 & 处截断）
	if idx := strings.Index(rawQuery, "url="); idx != -1 {
		feedURL = rawQuery[idx+4:]
		// URL 解码
		if decoded, err := url.QueryUnescape(feedURL); err == nil {
			feedURL = decoded
		}
	}

	if feedURL == "" {
		// 备选方案：尝试从标准参数获取
		feedURL = r.URL.Query().Get("url")
	}

	if feedURL == "" {
		sendJSON(w, 400, map[string]interface{}{"error": "Missing url parameter"})
		return
	}

	feedURL = decodeHtmlEntities(feedURL)

	// 处理 RSSHub 协议
	if isRSSHubURL(feedURL) {
		oldURL := feedURL
		feedURL = convertRSSHubURL(feedURL)
		log.Printf("[RSS] RSSHub converted: %s -> %s", oldURL, feedURL)
	}

	log.Printf("[RSS] Fetching: %s", feedURL)

	// 创建请求
	// 配置跳过 SSL 验证的 Transport
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{
		Timeout:   30 * time.Second,
		Transport: tr,
	}

	req, err := http.NewRequest("GET", feedURL, nil)
	if err != nil {
		log.Printf("[RSS] Error creating request: %v", err)
		sendJSON(w, 500, map[string]interface{}{"error": "Failed to create request"})
		return
	}

	// 设置请求头，模拟真实浏览器
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml, application/atom+xml, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(req)

	// 🔥 HTTPS -> HTTP 降级重试策略
	if err != nil && strings.HasPrefix(feedURL, "https://") {
		log.Printf("[RSS] HTTPS fetch failed for %s, trying fallback to HTTP. Error: %v", feedURL, err)
		httpURL := strings.Replace(feedURL, "https://", "http://", 1)

		reqHTTP, errHTTP := http.NewRequest("GET", httpURL, nil)
		if errHTTP == nil {
			// 复制请求头
			reqHTTP.Header = req.Header

			respHTTP, errRetry := client.Do(reqHTTP)
			if errRetry == nil {
				log.Printf("[RSS] HTTP fallback succeeded for %s", httpURL)
				resp = respHTTP
				err = nil
				feedURL = httpURL // 更新 URL 以便后续正确处理相对路径
			} else {
				log.Printf("[RSS] HTTP fallback also failed: %v", errRetry)
			}
		}
	}

	if err != nil {
		log.Printf("[RSS] Error fetching %s: %v", feedURL, err)
		sendJSON(w, 502, map[string]interface{}{"error": "Failed to fetch RSS feed"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[RSS] Unexpected status %d for %s", resp.StatusCode, feedURL)
		sendJSON(w, resp.StatusCode, map[string]interface{}{"error": fmt.Sprintf("Server returned status %d", resp.StatusCode)})
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[RSS] Error reading body: %v", err)
		sendJSON(w, 500, map[string]interface{}{"error": "Failed to read response"})
		return
	}

	content := string(body)

	// 🔥 在替换图片 URL 之前，先修复相对路径
	content = fixRelativeImageURLs(content, feedURL)

	// 替换图片 URL
	content = replaceImageURLs(content)

	// 返回响应
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(resp.StatusCode)
	w.Write([]byte(content))

	log.Printf("[RSS] Success: %d bytes", len(content))
}

// handleImage 处理图片代理请求
func handleImage(w http.ResponseWriter, r *http.Request) {
	// 从 RawQuery 手动提取 url 参数，避免自动解码导致的 & 截断问题
	rawQuery := r.URL.RawQuery
	imageURL := ""

	// 查找 url= 参数（取所有内容，不在 & 处截断）
	if idx := strings.Index(rawQuery, "url="); idx != -1 {
		imageURL = rawQuery[idx+4:]
		// URL 解码（只解码一次）
		if decoded, err := url.QueryUnescape(imageURL); err == nil {
			imageURL = decoded
		}
	}

	if imageURL == "" {
		sendJSON(w, 400, map[string]interface{}{"error": "Missing url parameter"})
		return
	}

	// HTML 实体解码
	imageURL = decodeHtmlEntities(imageURL)

	if !strings.HasPrefix(imageURL, "http://") && !strings.HasPrefix(imageURL, "https://") {
		log.Printf("[Image] Invalid URL format: %s", imageURL[:min(50, len(imageURL))])
		sendJSON(w, 400, map[string]interface{}{"error": "Invalid URL format"})
		return
	}

	log.Printf("[Image] Streaming: %s", imageURL[:min(100, len(imageURL))])

	streamImage(w, r, imageURL, 0)
}

// streamImage 流式转发图片
func streamImage(w http.ResponseWriter, r *http.Request, targetURL string, redirectCount int) {
	if redirectCount > 5 {
		log.Printf("[Image] Too many redirects: %s", targetURL)
		sendJSON(w, 502, map[string]interface{}{"error": "Too many redirects"})
		return
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse // 手动处理重定向
		},
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		log.Printf("[Image] Error creating request: %v", err)
		sendJSON(w, 500, map[string]interface{}{"error": "Failed to create request"})
		return
	}

	// 设置请求头
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "image/*,*/*")
	req.Header.Set("Referer", getReferer(targetURL))

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Image] Error fetching: %v", err)
		sendJSON(w, 502, map[string]interface{}{"error": "Failed to fetch image"})
		return
	}
	defer resp.Body.Close()

	// 处理重定向
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		location := resp.Header.Get("Location")
		if location != "" {
			log.Printf("[Image] Redirect to: %s", location)
			streamImage(w, r, location, redirectCount+1)
			return
		}
	}

	// 复制响应头
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	w.WriteHeader(resp.StatusCode)

	// 流式传输
	written, err := io.Copy(w, resp.Body)
	if err != nil {
		log.Printf("[Image] Error streaming: %v", err)
		return
	}

	log.Printf("[Image] Success: %d bytes", written)
}

// handleSubscribe 处理订阅请求
// 极简代理模式下，服务端不存储订阅列表，直接返回成功
func handleSubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		sendJSON(w, 405, map[string]interface{}{"success": false, "message": "Method not allowed"})
		return
	}

	log.Printf("[Subscribe] New subscription request")
	sendJSON(w, 200, map[string]interface{}{"success": true, "message": "Subscribed"})
}

// handleRSSHubInstances 返回可用的 RSSHub 实例
func handleRSSHubInstances(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(200)

	// 简单序列化
	var instStrs []string
	for _, inst := range rsshubInstances {
		instStrs = append(instStrs, fmt.Sprintf(`"%s"`, inst))
	}
	fmt.Fprintf(w, `{"instances":[%s],"active":"%s","default":"%s"}`,
		strings.Join(instStrs, ","), activeRSSHub, defaultRSSHub)
}

// handleHealth 健康检查
func handleHealth(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, 200, map[string]interface{}{
		"status":  "ok",
		"service": "rss-proxy-go",
		"time":    time.Now().Format(time.RFC3339),
	})
}

// authMiddleware 认证中间件
func authMiddleware(next http.HandlerFunc, skipAuth bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS 预检
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(204)
			return
		}

		// 跳过认证的接口
		if skipAuth || validateToken(r) {
			next(w, r)
			return
		}

		log.Printf("[Auth] Unauthorized request: %s", r.URL.Path)
		sendJSON(w, 401, map[string]interface{}{"error": "Unauthorized"})
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	// 路由
	http.HandleFunc("/api/rss", authMiddleware(handleRSS, false))
	http.HandleFunc("/api/rsshub/instances", authMiddleware(handleRSSHubInstances, true)) // 公开实例列表
	http.HandleFunc("/api/image", authMiddleware(handleImage, true))                      // 图片跳过认证
	http.HandleFunc("/api/subscribe", authMiddleware(handleSubscribe, false))             // 订阅接口
	http.HandleFunc("/health", authMiddleware(handleHealth, true))
	http.HandleFunc("/", authMiddleware(handleHealth, true))

	addr := ":" + port
	log.Printf("RSS Proxy Server (Go) starting on %s", addr)
	log.Printf("SERVER_URL: %s", serverURL)
	if authToken != "" {
		log.Printf("Auth: enabled (token: %s***)", authToken[:min(3, len(authToken))])
	} else {
		log.Printf("Auth: disabled")
	}

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
