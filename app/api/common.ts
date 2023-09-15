import { NextRequest, NextResponse } from "next/server";
import MD5 from 'crypto-js/md5';

export const OPENAI_URL = "api.openai.com";
const DEFAULT_PROTOCOL = "https";
const PROTOCOL = process.env.PROTOCOL || DEFAULT_PROTOCOL;
const BASE_URL = process.env.BASE_URL || OPENAI_URL;
const DISABLE_GPT4 = !!process.env.DISABLE_GPT4;
const CPM_BEE_SK = process.env.CPM_BEE_SK || "";
const CPM_BEE_INFERENCE_ENDPOINT = process.env.CPM_BEE_INFERENCE_ENDPOINT || "inference";
const CPM_BEE_ENDPOINT_NAME = process.env.CPM_BEE_ENDPOINT_NAME;

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();
  const authValue = req.headers.get("Authorization") ?? "";
  const openaiPath = `${req.nextUrl.pathname}${req.nextUrl.search}`.replaceAll(
    "/api/openai/",
    "",
  );

  let baseUrl = BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `${PROTOCOL}://${baseUrl}`;
  }

  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", openaiPath);
  console.log("[Base Url]", baseUrl);

  if (process.env.OPENAI_ORG_ID) {
    console.log("[Org ID]", process.env.OPENAI_ORG_ID);
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10 * 60 * 1000);

  const body = await req.json();
  const isCPMBee = body && body.model && body.model.indexOf("cpm-bee") != -1;

  const fetchUrl = isCPMBee ? `${baseUrl}/${CPM_BEE_INFERENCE_ENDPOINT}` : `${baseUrl}/${openaiPath}`;
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(!isCPMBee && { Authorization: authValue }),
      ...(process.env.OPENAI_ORG_ID && {
        "OpenAI-Organization": process.env.OPENAI_ORG_ID,
      }),
    },
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };
  if (isCPMBee) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = `${timestamp}${CPM_BEE_SK}`;
    const sign = MD5(Buffer.from(sig, 'utf-8').toString()).toString();
    let input = "";
    let prompt = "";
    let question = "";
    for (let i = 0; i < body.messages.length; i++) {
      const message = body.messages[i];
      const content = message.content.trim();
      if (content == "")
        continue;
      input += `${message.role == "assistant" ? "<AI>": "<用户>"}${message.content.trim()}`;
    }
    input += `<AI>`;
    fetchOptions.body = JSON.stringify({
      endpoint_name: CPM_BEE_ENDPOINT_NAME,
      ak: authValue.replace("Bearer ", "").trim(),
      timestamp,
      sign,
      input: JSON.stringify({
        input,
        ...(prompt != "" && { prompt }),
        ...(question != "" && { question }),
        "<ans>": ""
      }),
    });
    console.log("[CPM-Bee] payload:", input);
  }

  // #1815 try to refuse gpt4 request
  if (DISABLE_GPT4 && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody);

      if ((jsonBody?.model ?? "").includes("gpt-4")) {
        return NextResponse.json(
          {
            error: true,
            message: "you are not allowed to use gpt-4 model",
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
