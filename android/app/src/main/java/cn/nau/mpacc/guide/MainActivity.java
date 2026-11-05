package cn.nau.mpacc.guide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small platform-only reader. No JavaScript bridge and no storage permission. */
public final class MainActivity extends Activity {
    private static final String SITE_HOST = "nishino0525nanase.github.io";
    private static final String SITE_PATH = "/nau-mpacc-guide/";
    private static final String SITE = "https://" + SITE_HOST + SITE_PATH;
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String LOCAL = "https://" + ASSET_HOST + "/guide/index.html";
    private static final int SAVE_DOCUMENT = 40;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private WebView web;
    private TextView status;
    private SharedPreferences preferences;
    private String pendingAsset;
    private boolean offline;
    private boolean restoreAfterLoad;
    private Runnable timeout;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("guide", MODE_PRIVATE);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(248, 245, 238));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        status = new TextView(this);
        status.setTextColor(Color.rgb(23, 58, 73));
        status.setTextSize(13);
        status.setPadding(dp(12), dp(8), 0, dp(8));
        toolbar.addView(status, new LinearLayout.LayoutParams(0, dp(52), 1));
        Button latest = button("在线", () -> changeMode(false));
        latest.setContentDescription("打开最新在线指南");
        toolbar.addView(latest);
        Button bundled = button("内置", () -> changeMode(true));
        bundled.setContentDescription("打开内置离线指南");
        toolbar.addView(bundled);
        Button more = button("⋮", () -> {});
        more.setContentDescription("更多选项");
        more.setOnClickListener(v -> showMenu(v));
        toolbar.addView(more);
        root.addView(toolbar);
        web = new WebView(this);
        configure(web);
        web.setWebViewClient(new ReaderClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
                if (!userGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                configure(popup);
                popup.getSettings().setJavaScriptEnabled(false);
                popup.getSettings().setDomStorageEnabled(false);
                popup.getSettings().setBlockNetworkLoads(true);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        handleNavigation(r.getUrl());
                        v.destroy();
                        return true;
                    }
                    @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                        if (!"about:blank".equals(url)) { handleNavigation(Uri.parse(url)); v.destroy(); }
                    }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, type, length) -> handleDownload(Uri.parse(url)));
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        root.requestApplyInsets();
        if (state != null) pendingAsset = state.getString("pendingAsset");
        // Prefer the current website; connection failures fall back to the packaged edition.
        loadMode(false, "");
    }

    private int dp(int value) { return Math.round(getResources().getDisplayMetrics().density * value); }
    private Button button(String title, Runnable action) {
        Button b = new Button(this);
        b.setText(title);
        b.setTextSize(13);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setOnClickListener(v -> action.run());
        return b;
    }

    @SuppressWarnings("deprecation")
    private void configure(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(true);
    }

    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "不计入本机访问量");
        menu.getMenu().add(0, 2, 1, "在浏览器打开官网");
        menu.getMenu().add(0, 3, 2, "关于 1.0.0 测试版");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) {
                preferences.edit().putBoolean("excludeSelf", true).apply();
                toast("已排除本机；仅此应用内访问生效");
                if (!offline) changeMode(false);
            } else if (item.getItemId() == 2) {
                openExternal(Uri.parse(SITE + (preferences.getBoolean("excludeSelf", false) ? "?exclude_self=1" : "")));
            } else {
                new android.app.AlertDialog.Builder(this).setTitle("雨诺的南审手记 1.0.0")
                    .setMessage("个人测试版 · 非学校官方应用\n\n在线读取最新指南；断网可读随安装包提供的资料。外部来源在系统浏览器打开。内置版 Word / Excel 可保存到你选择的位置。\n\n仅申请联网权限；联系清单保存在本机。清除应用数据或卸载会移除清单。")
                    .setPositiveButton("知道了", null).show();
            }
            return true;
        });
        menu.show();
    }

    private boolean hasOrigin(Uri uri, String host) {
        return "https".equalsIgnoreCase(uri.getScheme()) && host.equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private boolean isOnline(Uri uri) { return hasOrigin(uri, SITE_HOST) && uri.getPath() != null && uri.getPath().startsWith(SITE_PATH); }
    private boolean isLocal(Uri uri) { return hasOrigin(uri, ASSET_HOST) && uri.getPath() != null && uri.getPath().startsWith("/guide/"); }
    private boolean isGuide(Uri uri) {
        String path = uri.getPath();
        return (isOnline(uri) && (SITE_PATH.equals(path) || (SITE_PATH + "index.html").equals(path)))
                || (isLocal(uri) && "/guide/index.html".equals(path));
    }
    private String currentHash() {
        Uri uri = Uri.parse(web.getUrl() == null ? SITE : web.getUrl());
        String hash = uri.getEncodedFragment();
        return hash == null ? "" : "#" + hash;
    }
    private void changeMode(boolean local) {
        String hash = currentHash();
        rememberChecklist(() -> loadMode(local, hash));
    }
    private void loadMode(boolean local, String hash) {
        cancelTimeout();
        offline = local;
        restoreAfterLoad = true;
        web.stopLoading();
        status.setText(local ? "雨诺手记\n内置资料 · 1.0.0" : "雨诺手记\n在线最新资料");
        String url = local ? LOCAL : SITE + (preferences.getBoolean("excludeSelf", false) ? "?exclude_self=1" : "");
        web.loadUrl(url + hash);
        if (!local) {
            timeout = () -> {
                if (offline) return;
                if (web.getProgress() < 100) { fallback(); return; }
                web.evaluateJavascript("document.querySelector('#app .loading-state, #app .error-details')!==null", result -> {
                    if ("true".equals(result)) fallback();
                });
            };
            main.postDelayed(timeout, 15000);
        }
    }
    private void cancelTimeout() { if (timeout != null) main.removeCallbacks(timeout); }
    private void fallback() {
        if (offline || isFinishing()) return;
        toast("网络暂不可用，已切换内置资料；可点“在线”重试");
        // A failed, partly loaded online page may still contain an older origin copy.
        // Preserve the last valid native checklist instead of copying that stale value.
        loadMode(true, currentHash());
    }

    private boolean handleNavigation(Uri uri) {
        if (isLocal(uri) && uri.getPath().endsWith(".apk")) {
            openExternal(Uri.parse(SITE + uri.getEncodedPath().substring("/guide/".length())));
            return true;
        }
        if (isDownload(uri)) { handleDownload(uri); return true; }
        if (isGuide(uri)) return false;
        openExternal(uri);
        return true;
    }
    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)
                || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme))) {
            toast("此链接类型不受支持，请从原始网页打开"); return;
        }
        // Never send the synthetic asset host to another application.
        if (ASSET_HOST.equalsIgnoreCase(uri.getHost())) { toast("内置资料链接不可外部打开"); return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException e) { toast("没有可打开此链接的应用"); }
    }

    private boolean isDownload(Uri uri) {
        String path = uri.getPath();
        return (isOnline(uri) || isLocal(uri)) && path != null &&
                (path.endsWith(".docx") || path.endsWith(".xlsx"));
    }
    private void handleDownload(Uri uri) {
        if (isLocal(uri) && uri.getPath().endsWith(".apk")) {
            openExternal(Uri.parse(SITE + uri.getEncodedPath().substring("/guide/".length())));
            return;
        }
        if (isLocal(uri)) {
            String path = safeAssetPath(uri);
            if (path == null || !isDownload(uri)) { toast("无效的资料路径"); return; }
            pendingAsset = path;
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
            save.setType(path.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            save.putExtra(Intent.EXTRA_TITLE, path.substring(path.lastIndexOf('/') + 1));
            try { startActivityForResult(save, SAVE_DOCUMENT); }
            catch (ActivityNotFoundException e) { pendingAsset = null; toast("当前系统没有文件保存器，请联网后从官网下载"); }
        } else { openExternal(uri); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SAVE_DOCUMENT) return;
        String asset = pendingAsset;
        pendingAsset = null;
        if (result != RESULT_OK || data == null || data.getData() == null || asset == null) return;
        Uri destination = data.getData();
        files.execute(() -> {
            try (InputStream input = getAssets().open(asset);
                 OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new IOException("No output stream");
                byte[] buffer = new byte[16384];
                int n;
                while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
                main.post(() -> toast("资料已保存到你选择的位置"));
            } catch (IOException | SecurityException e) { main.post(() -> toast("未能保存文件，请重新选择保存位置")); }
        });
    }

    /** Decode once; reject traversal, alternate separators and unsupported filenames. */
    private String safeAssetPath(Uri uri) {
        if (!isLocal(uri)) return null;
        String path = uri.getPath().substring("/guide/".length());
        if (path.isEmpty()) path = "index.html";
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || !part.matches("[A-Za-z0-9._-]+")) return null;
        }
        return "guide/" + path;
    }
    private WebResourceResponse localResponse(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = safeAssetPath(uri);
        if (!"GET".equals(request.getMethod()) || path == null) return failure(403, "Forbidden");
        try {
            String type = mime(path);
            return new WebResourceResponse(type, type.startsWith("text/") || type.contains("json") || type.contains("javascript") ? "UTF-8" : null,
                    200, "OK", Collections.singletonMap("X-Content-Type-Options", "nosniff"), getAssets().open(path));
        } catch (IOException e) { return failure(404, "Not Found"); }
    }
    private WebResourceResponse failure(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, Collections.emptyMap(),
                new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    }
    private String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        if (path.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (path.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return "application/octet-stream";
    }

    // Share only this guide's explicit contact checklist between its two trusted origins.
    // There is no JavaScript interface or access to any other browser/application data.
    private void rememberChecklist(Runnable after) {
        if (web.getUrl() == null || !isGuide(Uri.parse(web.getUrl()))) { after.run(); return; }
        web.evaluateJavascript("(function(){try{return localStorage.getItem('nau-guide-contact-list-v1')}catch(e){return null}})()", result -> {
            try {
                Object value = new JSONTokener(result).nextValue();
                if (value instanceof String && ((String) value).length() < 50000) {
                    JSONObject source = new JSONObject((String) value);
                    JSONObject clean = new JSONObject();
                    Iterator<String> keys = source.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        String choice = source.optString(key);
                        if (key.matches("[A-Za-z0-9_-]{1,80}") && (choice.equals("优先联系") || choice.equals("备选") || choice.equals("仅了解"))) clean.put(key, choice);
                    }
                    preferences.edit().putString("checklist", clean.toString()).apply();
                }
            } catch (Exception ignored) { /* Keep the existing valid local checklist. */ }
            after.run();
        });
    }
    private void restoreChecklist(String url) {
        if (!isGuide(Uri.parse(url))) return;
        String saved = preferences.getString("checklist", null);
        if (saved == null) return;
        web.evaluateJavascript("(function(){try{var v=" + JSONObject.quote(saved) + ";if(localStorage.getItem('nau-guide-contact-list-v1')!==v){localStorage.setItem('nau-guide-contact-list-v1',v);location.reload()}}catch(e){}})()", null);
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    private final class ReaderClient extends WebViewClient {
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            Uri uri = Uri.parse(url);
            if (isGuide(uri)) {
                offline = isLocal(uri);
                status.setText(offline ? "雨诺手记\n内置资料 · 1.0.0" : "雨诺手记\n在线最新资料");
            }
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl());
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // An invalid path on this host must never escape to the network.
            if (ASSET_HOST.equalsIgnoreCase(request.getUrl().getHost())) return localResponse(request);
            return null;
        }
        private boolean critical(WebResourceRequest request) {
            String path = request.getUrl().getPath();
            return isOnline(request.getUrl()) && (request.isForMainFrame() || path.endsWith(".json") || path.endsWith(".js") || path.endsWith(".css"));
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (critical(request)) main.post(MainActivity.this::fallback);
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (critical(request) && response.getStatusCode() >= 400) main.post(MainActivity.this::fallback);
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            if (isOnline(Uri.parse(error.getUrl()))) main.post(MainActivity.this::fallback);
        }
        @Override public void onPageFinished(WebView view, String url) {
            if (restoreAfterLoad && isGuide(Uri.parse(url))) {
                restoreAfterLoad = false;
                restoreChecklist(url);
            }
            if (offline) cancelTimeout();
        }
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) rememberChecklist(() -> web.goBack());
        else super.onBackPressed();
    }
    @Override protected void onPause() {
        rememberChecklist(() -> {});
        web.onPause();
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("pendingAsset", pendingAsset);
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        cancelTimeout();
        web.destroy();
        files.shutdown();
        super.onDestroy();
    }
}
