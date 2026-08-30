export default {
  async fetch(request) {

    // 1. 요청을 보낸 프론트엔드의 주소(Origin)를 확인합니다.
    const origin = request.headers.get("Origin");

    // [허용할 주소 목록] 내 로컬 주소 및 실서버 주소를 적습니다.
    const allowedOrigins = [
      "http://localhost:3001",
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:3007",
      "https://dooboostore.github.io"
    ];

    // 허용된 주소가 아니거나, Origin이 없는 경우 차단합니다.
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response("Access Denied: Unauthorized Origin", { status: 403 });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("CORS Proxy is running.", { status: 200 });
    }

    // OPTIONS(Preflight) 요청이 오면 CORS 헤더만 즉시 반환하고 통과시킵니다.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    try {
      // 1. 요청 헤더 복사 및 일반 브라우저처럼 보이도록 변조
      const headers = new Headers(request.headers);
      headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      // Referer를 타겟 URL의 origin으로 설정 (해당 서버가 자사 도메인에서 온 요청으로 인식)
      const targetOrigin = new URL(targetUrl).origin;
      headers.set("Referer", targetOrigin + "/");

      // Cloudflare가 자동으로 붙이는 프록시 헤더 제거
      headers.delete("cf-connecting-ip");
      headers.delete("cf-worker");
      headers.delete("cf-ray");

      // 타겟 서버가 Origin 헤더로 접근을 차단하는 경우를 방지하기 위해 제거합니다.
      // (toss 등 일부 서버는 허용되지 않은 Origin이 있으면 403을 반환합니다.)
      headers.delete("origin");

      // 2. 타겟 서버로 요청 전송
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "follow"
      });

      // 3. 브라우저로 내려줄 응답 헤더 설정 (CORS 헤더 강제 주입)
      const newHeaders = new Headers(response.headers);
      // 요청한 클라이언트 origin으로 CORS 허용 (보안상 * 대신 요청 origin으로 반환)
      newHeaders.set("Access-Control-Allow-Origin", origin);
      newHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "*");

      // 보안 헤더 중 클라이언트에서 충돌 날 수 있는 헤더 제거
      newHeaders.delete("content-security-policy");
      newHeaders.delete("x-frame-options");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (error) {
      return new Response("Proxy Fetch Error: " + error.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": origin }
      });
    }
  }
};
