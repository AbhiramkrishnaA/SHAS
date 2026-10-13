const menuToggle = document.querySelector(".menu-toggle");
const primaryNavigation = document.querySelector(".primary-nav");
if (menuToggle && primaryNavigation) {
  const closeMenu = () => { menuToggle.setAttribute("aria-expanded", "false"); menuToggle.setAttribute("aria-label", "Open navigation"); primaryNavigation.classList.remove("is-open"); };
  menuToggle.addEventListener("click", () => { const open = menuToggle.getAttribute("aria-expanded") === "true"; menuToggle.setAttribute("aria-expanded", String(!open)); menuToggle.setAttribute("aria-label", open ? "Open navigation" : "Close navigation"); primaryNavigation.classList.toggle("is-open", !open); });
  primaryNavigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
}
const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
const initialPhotos = ["photo_2026-10-08_22-26-58.jpg", "photo_2026-10-08_22-26-54.jpg", "photo_2026-10-08_22-26-40.jpg", "photo_2026-10-08_22-26-36.jpg", "photo_2026-10-08_22-26-28.jpg", "photo_2026-10-08_22-26-23.jpg", "photo_2026-10-08_22-26-18.jpg", "photo_2026-10-08_22-26-14.jpg", "photo_2026-10-08_22-26-10.jpg", "photo_2026-10-08_22-26-05.jpg", "photo_2026-10-08_22-26-01.jpg", "photo_2026-10-08_22-25-57.jpg", "photo_2026-10-08_22-25-52.jpg", "photo_2026-10-08_22-25-36.jpg"].map((name, i) => ({ id: `starter-${i}`, name, url: `gallary/${encodeURIComponent(name)}` }));
async function galleryItems() {
  try { return await api("/api/gallery"); }
  catch { return initialPhotos; }
}
const galleryGrid = document.querySelector("[data-gallery-grid]");
if (galleryGrid) galleryItems().then((items) => { galleryGrid.innerHTML = items.map((item, i) => `<figure class="work-image"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}" loading="lazy"><figcaption><span>${String(i + 1).padStart(2, "0")}</span> ${escapeHtml(item.name)}</figcaption></figure>`).join(""); });
const homeSlider = document.querySelector("[data-home-slider]");
if (homeSlider) galleryItems().then((items) => {
  const slidesData = items.slice(0, 6);
  homeSlider.innerHTML = slidesData.map((item) => `<div class="home-slide" style="background-image:url('${escapeHtml(item.url)}')"></div>`).join("");
  const slides = [...homeSlider.children]; let active = 0; slides[0]?.classList.add("active");
  if (slides.length > 1) window.setInterval(() => { slides[active].classList.remove("active"); active = (active + 1) % slides.length; slides[active].classList.add("active"); }, 4500);
});
const tenderList = document.querySelector("[data-tender-list]");
if (tenderList) api("/api/tenders").then((items) => {
  if (!items.length) { tenderList.innerHTML = '<p class="demo-note">No tender notices have been published.</p>'; return; }
  tenderList.innerHTML = items.map((item) => `<article class="tender-card"><div class="tender-main"><span class="tender-label">Tender notice</span><h3>${escapeHtml(item.heading)}</h3></div><div class="tender-deadline"><span>Last date to apply</span><strong>${escapeHtml(item.endDate)}</strong></div><a class="tender-pdf" href="${escapeHtml(item.pdfUrl)}" target="_blank" rel="noopener">View PDF <span aria-hidden="true">↗</span></a></article>`).join("");
}).catch(() => { tenderList.innerHTML = '<p class="demo-note">Tender notices are temporarily unavailable.</p>'; });

const noticeBox = document.querySelector("[data-home-notice]");
if (noticeBox) api("/api/notice").then((notice) => {
  const title = noticeBox.querySelector("[data-notice-title]");
  const message = noticeBox.querySelector("[data-notice-message]");
  const link = noticeBox.querySelector(".notice-link");
  if (title) title.textContent = notice.title;
  if (message) message.textContent = notice.message;
  const ticker = document.querySelector("[data-notice-ticker]");
  if (ticker) {
    const text = `SAHS update: ${notice.title} · ${notice.message} · `;
    ticker.querySelectorAll("span").forEach((copy) => { copy.textContent = text; });
  }
  if (link) {
    if (link.firstChild) link.firstChild.nodeValue = `${notice.linkText || "More information"} `;
    if (notice.linkUrl) link.href = notice.linkUrl;
    else link.hidden = true;
  }
}).catch(() => {});

const blogList = document.querySelector("[data-blog-list]");
if (blogList) api("/api/blogs").then((items) => {
  if (!items.length) { blogList.innerHTML = '<p class="blog-empty">No stories have been published yet.</p>'; return; }
  blogList.innerHTML = items.map((item) => `<article class="blog-card">${item.imageUrl ? `<div class="blog-image"><img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy"></div>` : '<div class="blog-image blog-image-placeholder" aria-hidden="true"></div>'}<div class="blog-card-copy"><p class="blog-date">${escapeHtml(item.date)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><details class="blog-read-more"><summary>Read article</summary><p class="blog-card-body">${escapeHtml(item.body)}</p></details></div></article>`).join("");
}).catch(() => {});

const loginForm = document.querySelector("#ccp-login");
const ccpEditor = document.querySelector("#ccp-editor");
if (loginForm && ccpEditor) {
  const message = document.querySelector("#ccp-message");
  const imageForm = document.querySelector("#ccp-image-form");
  const tenderForm = document.querySelector("#ccp-tender-form");
  const noticeForm = document.querySelector("#ccp-notice-form");
  const blogForm = document.querySelector("#ccp-blog-form");
  const blogCancel = document.querySelector("#ccp-blog-cancel");
  const passwordToggle = document.querySelector("[data-password-toggle]");
  const showMessage = (text, error = false) => { message.textContent = text; message.classList.toggle("is-error", error); };
  if (passwordToggle) passwordToggle.addEventListener("click", () => {
    const passwordInput = loginForm.elements.password;
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    passwordToggle.querySelector("span").textContent = show ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    passwordToggle.setAttribute("aria-pressed", String(show));
  });
  const renderAdmin = async () => {
    const items = await api("/api/admin/content");
    document.querySelector("#ccp-images").innerHTML = items.gallery.map((p) => `<li>${escapeHtml(p.name)} <button type="button" data-delete-image="${escapeHtml(p.id)}">Remove</button></li>`).join("") || "<li>No uploaded images yet.</li>";
    document.querySelector("#ccp-tenders").innerHTML = items.tenders.map((t) => `<li>${escapeHtml(t.heading)} — ${escapeHtml(t.endDate)} <button type="button" data-delete-tender="${escapeHtml(t.id)}">Remove</button></li>`).join("") || "<li>No tenders yet.</li>";
    document.querySelector("#ccp-blogs").innerHTML = items.blogs.map((blog) => `<li><div><strong>${escapeHtml(blog.title)}</strong><small>${escapeHtml(blog.date)}${blog.id.startsWith("demo-") ? " · demo post" : ""}</small></div><div class="ccp-list-actions"><button type="button" data-edit-blog="${escapeHtml(blog.id)}">Edit</button><button type="button" data-delete-blog="${escapeHtml(blog.id)}">Delete</button></div></li>`).join("") || "<li>No blogs yet.</li>";
    const selectedImage = blogForm.elements.imageUrl.value;
    const galleryItemsForBlogs = await api("/api/gallery");
    blogForm.elements.imageUrl.innerHTML = '<option value="">No image</option>' + galleryItemsForBlogs.map((photo) => `<option value="${escapeHtml(photo.url)}">${escapeHtml(photo.name)}</option>`).join("");
    blogForm.elements.imageUrl.value = selectedImage;
    noticeForm.elements.title.value = items.notice.title || "";
    noticeForm.elements.message.value = items.notice.message || "";
    noticeForm.elements.linkText.value = items.notice.linkText || "";
    noticeForm.elements.linkUrl.value = items.notice.linkUrl || "";
  };
  const revealEditor = async () => { loginForm.hidden = true; ccpEditor.hidden = false; try { await renderAdmin(); } catch (error) { showMessage(error.message, true); } };
  api("/api/session").then(revealEditor).catch(() => {});
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(loginForm); const button = loginForm.querySelector("button"); button.disabled = true;
    try { await api("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) }); showMessage("Signed in."); await revealEditor(); }
    catch (error) { showMessage(error.message, true); } finally { button.disabled = false; }
  });
  document.querySelector("#ccp-logout").addEventListener("click", async () => { await api("/api/logout", { method: "POST" }); ccpEditor.hidden = true; loginForm.hidden = false; loginForm.reset(); showMessage("Signed out."); });
  imageForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = imageForm.querySelector("button"); button.disabled = true;
    try { for (const file of imageForm.elements.images.files) { const form = new FormData(); form.append("images", file); await api("/api/admin/gallery", { method: "POST", body: form }); } imageForm.reset(); await renderAdmin(); showMessage("Gallery images uploaded."); }
    catch (error) { showMessage(error.message, true); } finally { button.disabled = false; }
  });
  tenderForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = tenderForm.querySelector("button"); button.disabled = true;
    try { await api("/api/admin/tenders", { method: "POST", body: new FormData(tenderForm) }); tenderForm.reset(); await renderAdmin(); showMessage("Tender published."); }
    catch (error) { showMessage(error.message, true); } finally { button.disabled = false; }
  });
  noticeForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = noticeForm.querySelector("button[type='submit']"); button.disabled = true;
    try { const data = Object.fromEntries(new FormData(noticeForm)); await api("/api/admin/notice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); showMessage("Notification saved and published."); }
    catch (error) { showMessage(error.message, true); } finally { button.disabled = false; }
  });
  const resetBlogForm = () => { blogForm.reset(); blogForm.elements.blogId.value = ""; document.querySelector("#ccp-blog-form-title").textContent = "Add a blog post"; blogForm.querySelector("[data-blog-submit]").textContent = "Publish blog"; blogCancel.hidden = true; };
  blogCancel.addEventListener("click", resetBlogForm);
  blogForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = blogForm.querySelector("[data-blog-submit]"); button.disabled = true;
    const values = Object.fromEntries(new FormData(blogForm)); const id = values.blogId; delete values.blogId;
    try { await api(id ? `/api/admin/blogs/${encodeURIComponent(id)}` : "/api/admin/blogs", { method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }); resetBlogForm(); await renderAdmin(); showMessage(id ? "Blog updated." : "Blog published."); }
    catch (error) { showMessage(error.message, true); } finally { button.disabled = false; }
  });
  ccpEditor.addEventListener("click", async (event) => {
    const imageId = event.target.dataset.deleteImage; const tenderId = event.target.dataset.deleteTender;
    const blogId = event.target.dataset.deleteBlog; const editId = event.target.dataset.editBlog;
    try {
      if (editId) { const blog = (await api("/api/admin/content")).blogs.find((entry) => entry.id === editId); if (!blog) throw new Error("Blog not found."); for (const key of ["title", "summary", "body", "date", "imageUrl"]) blogForm.elements[key].value = blog[key] || ""; blogForm.elements.blogId.value = blog.id; document.querySelector("#ccp-blog-form-title").textContent = "Edit blog post"; blogForm.querySelector("[data-blog-submit]").textContent = "Save changes"; blogCancel.hidden = false; blogForm.scrollIntoView({ behavior: "smooth", block: "start" }); }
      if (imageId) await api(`/api/admin/gallery/${encodeURIComponent(imageId)}`, { method: "DELETE" });
      if (tenderId) await api(`/api/admin/tenders/${encodeURIComponent(tenderId)}`, { method: "DELETE" });
      if (blogId) await api(`/api/admin/blogs/${encodeURIComponent(blogId)}`, { method: "DELETE" });
      if (imageId || tenderId || blogId) { await renderAdmin(); showMessage("Selected content removed."); }
    }
    catch (error) { showMessage(error.message, true); }
  });
}
const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) { const observer = new IntersectionObserver((entries, current) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); current.unobserve(entry.target); } }), { threshold: .12 }); revealItems.forEach((item) => observer.observe(item)); }
else revealItems.forEach((item) => item.classList.add("is-visible"));
