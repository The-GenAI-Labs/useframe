// Vanilla JS shared by every generated site: sticky header state, the mobile
// menu, and reveal-on-scroll. Automated browsers (validation screenshots,
// the gallery) get static content so full-page captures never miss a section.
export const SITE_UI_JS = `const root = document.documentElement
const still = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver
const io = !still && "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue
    e.target.classList.add("is-in")
    io.unobserve(e.target)
  }
}, { rootMargin: "0px 0px -6% 0px" }) : null
if (io) root.classList.add("uf-motion")

function header() {
  return document.querySelector("[data-header]")
}

function setOpen(open) {
  const h = header()
  if (!h) return
  h.classList.toggle("is-open", open)
  const toggle = h.querySelector("[data-nav-toggle]")
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open))
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu")
  }
}

function onScroll() {
  const h = header()
  if (h) h.classList.toggle("is-scrolled", window.scrollY > 8)
}

function scan() {
  onScroll()
  if (!io) return
  document.querySelectorAll("[data-reveal]:not([data-reveal-seen])").forEach((el) => {
    el.setAttribute("data-reveal-seen", "")
    io.observe(el)
  })
}

document.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target : null
  if (!target) return
  const toggle = target.closest("[data-nav-toggle]")
  if (toggle) {
    setOpen(toggle.getAttribute("aria-expanded") !== "true")
    return
  }
  if (target.closest("[data-nav-menu] a")) setOpen(false)
})

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return
  const h = header()
  if (!h || !h.classList.contains("is-open")) return
  setOpen(false)
  const toggle = h.querySelector("[data-nav-toggle]")
  if (toggle) toggle.focus()
})

window.addEventListener("scroll", onScroll, { passive: true })
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true })
scan()
`;
