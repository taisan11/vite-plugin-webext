import { sendMessage } from "../../src/messaging"

browser.runtime.onInstalled.addListener(() => {
  console.log("vite-plugin-webext example installed")
})

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "getCount") {
    const { key } = message.payload as { key: string }
    const count = await browser.storage.local.get(key).then((v) => Number(v[key] ?? 0))
    return { count }
  }
})

async function incrementAndNotify() {
  const { count } = await sendMessage("getCount", { key: "clicks" })
  await browser.storage.local.set({ clicks: count + 1 })
  void browser.action.setBadgeText({ text: String(count + 1) })
}

browser.action.onClicked.addListener(() => {
  void incrementAndNotify()
})
