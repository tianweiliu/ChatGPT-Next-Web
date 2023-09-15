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
    } else {
      throw new Error("CPMBee response code is not 0");
    }
  } catch {
    return prettyObject(res);
  }
  if (result == "") {
    return prettyObject(res);
  } else {
    return result;
  }
}