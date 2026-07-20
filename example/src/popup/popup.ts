const button = document.querySelector<HTMLButtonElement>("#open-options")
button?.addEventListener("click", () => {
  void browser.runtime.openOptionsPage()
})
