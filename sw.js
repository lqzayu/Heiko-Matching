self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  // Firebase Cloud Messaging から届くときは、内容が data の中に入っている
  const data = payload.data || payload;
  const title = data.title || "新着メッセージ";
  const options = {
    body: data.body || "新しいメッセージが届きました",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: data.url || "messages.html" }
  };
  // 同じ相手からの通知は1つにまとめて、新しい内容で知らせ直す
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url ? event.notification.data.url : "messages.html";
  let target = new URL(requested, self.registration.scope);
  // このサイト以外のページは開かない
  if (!target.href.startsWith(self.registration.scope)) target = new URL("messages.html", self.registration.scope);
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (open) {
      try {
        const focused = await open.focus();
        await focused.navigate(target.href);
        return;
      } catch (error) {
        // 開いているタブを移動できないときは、新しく開く
      }
    }
    await clients.openWindow(target.href);
  })());
});
