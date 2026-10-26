
const SCRIPT_SRC = "/assets/js/adblock.js";
const TAG = `<script src="${SCRIPT_SRC}"></script>`;

export const config = {
  
  matcher: ["/((?!api/|assets/|_vercel/|favicon\\.ico).*)"],
};

export default async function middleware(request) {
  
  if (request.method !== "GET") return;

  if (request.headers.get("x-adblock-skip")) return;

  
  const headers = new Headers(request.headers);
  headers.set("x-adblock-skip", "1");
  headers.delete("accept-encoding"); 

  let res;
  try {
    res = await fetch(request.url, { headers, redirect: "manual" });
  } catch (e) {
    return; 
  }

  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) return res;

  let html = await res.text();

  
  if (!html.includes(SCRIPT_SRC)) {
    if (/<head[^>]*>/i.test(html)) {
      
      html = html.replace(/<head[^>]*>/i, (m) => m + "\n" + TAG);
    } else {
      html = TAG + "\n" + html;
    }
  }

  const out = new Headers(res.headers);
  out.delete("content-length");
  out.delete("content-encoding");
  return new Response(html, { status: res.status, statusText: res.statusText, headers: out });
}
