// No video or authenticated page caching. Notification contents remain generic.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Velo", {
      body: data.body || "You have an update.",
      tag: "velo-update",
      data: {
        url: ["/chat", "/inbox"].includes(data.url) ? data.url : "/inbox",
      },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/inbox",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate(url);
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
