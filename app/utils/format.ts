export function prettyObject(msg: any) {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

export function extractCPMBeeResponse(res: any) {
  let result = "";
  try {
    if (res.code == 0) {
      const data = JSON.parse(res.data.data);
      result = data["<ans>"];
    }
  } catch {}
  return result;
}