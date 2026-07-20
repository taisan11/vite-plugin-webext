import { sendMessage } from "../../../src/messaging"

const output = document.querySelector<HTMLOutputElement>("#count")
async function render() {
  const { count } = await sendMessage("getCount", { key: "clicks" })
  if (output) output.textContent = String(count)
}

void render()
