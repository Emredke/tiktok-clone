import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import {
  Bookmark,
  History,
  FolderPlus,
  Send,
  Bell,
  Trash2,
  ArrowLeft,
  Plus,
  X,
} from "lucide-react";
function useRefresh(load) {
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("velo-refresh", refresh);
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => {
      clearInterval(t);
      window.removeEventListener("velo-refresh", refresh);
    };
  }, [load]);
}
function SignIn({ app }) {
  return (
    <div className="empty">
      <h2>Make it yours</h2>
      <p>
        Sign in to keep your history, collections, and conversations together.
      </p>
      <button className="primary" onClick={() => app.setAuth("login")}>
        Sign in
      </button>
    </div>
  );
}
function Tiles({ items, app, history = false, remove, move }) {
  return (
    <div className="library-grid">
      {items.map((v, index) => (
        <article className="library-video" key={v.id}>
          <button
            className="library-cover"
            onClick={() =>
              app.navigate(
                `/v/${v.id}${history && v.position > 0 && v.position < v.duration - 0.5 ? `?resume=${v.position}` : ""}`,
              )
            }
          >
            <img src={v.thumbnail_url} alt={v.caption} loading="lazy" />
            <span>
              {history && v.position > 0 ? "Continue watching" : "Watch video"}
            </span>
          </button>
          <strong>{v.caption}</strong>
          <small>@{v.username}</small>
          {history && (
            <small>
              Watched{" "}
              {new Date(
                v.watched_at.replace(" ", "T") + "Z",
              ).toLocaleDateString()}{" "}
              · {Math.floor(v.position)}s
            </small>
          )}
          <div className="library-actions">
            {remove && (
              <button className="text-button" onClick={() => remove(v.id)}>
                Remove
              </button>
            )}
            {move && index > 0 && (
              <button className="text-button" onClick={() => move(index)}>
                Move earlier
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
export function Library({ app }) {
  const [tab, setTab] = useState("history"),
    [items, setItems] = useState([]),
    [libraries, setLibraries] = useState([]),
    [selected, setSelected] = useState(null),
    [prefs, setPrefs] = useState(null),
    [name, setName] = useState(""),
    [kind, setKind] = useState("collection"),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!app.user) return;
    try {
      const [l, s, d] = await Promise.all([
        api("/libraries"),
        api("/settings"),
        api(
          selected
            ? `/libraries/${selected.id}?offset=${offset}`
            : `/history?offset=${offset}`,
        ),
      ]);
      setLibraries(l.libraries);
      setPrefs(s.settings);
      setItems((old) =>
        offset
          ? [
              ...old.filter((v) => !d.videos.some((i) => i.id === v.id)),
              ...d.videos,
            ]
          : d.videos,
      );
      setMore(d.hasMore);
    } catch (e) {
      app.notify(e.message);
    }
  }, [app.user?.user_id, selected?.id, offset]);
  useEffect(() => {
    load();
  }, [load]);
  if (!app.user) return <SignIn app={app} />;
  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const open = (l) => {
    setItems([]);
    setOffset(0);
    setSelected(l);
    setTab(l ? "collection" : "history");
  };
  return (
    <section className="content-page community-page">
      <div className="eyebrow">YOUR MOMENTS, TOGETHER</div>
      <h1>
        Your Library<span>.</span>
      </h1>
      <p className="subheading">
        Find that video again. Keep the ones you love.
      </p>
      <div className="profile-tabs">
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => open(null)}
        >
          <History size={17} /> Watch history
        </button>
        <button
          className={tab === "collections" ? "selected" : ""}
          onClick={() => {
            setSelected(null);
            setTab("collections");
          }}
        >
          Collections & playlists
        </button>
        <button onClick={() => app.navigate("/settings")}>
          <Bell size={17} /> Settings
        </button>
      </div>
      {tab === "history" && (
        <>
          <div className="community-toolbar">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!prefs?.history_enabled}
                onChange={(e) =>
                  action(() =>
                    api(
                      "/settings",
                      {
                        ...prefs,
                        history_enabled: e.target.checked,
                        push_messages: !!prefs.push_messages,
                        push_replies: !!prefs.push_replies,
                        push_uploads: !!prefs.push_uploads,
                      },
                      "PUT",
                    ),
                  )
                }
              />
              Save watch history
            </label>
            <button
              className="secondary"
              disabled={busy || !items.length}
              onClick={() =>
                action(async () => {
                  await api("/history", {}, "DELETE");
                  setOffset(0);
                  setItems([]);
                })
              }
            >
              Clear history
            </button>
          </div>
          <p className="small-note">
            Only you can see this history. Turning it off stops new entries;
            clearing removes your saved history.
          </p>
          <Tiles
            items={items}
            app={app}
            history
            remove={(id) => action(() => api(`/history/${id}`, {}, "DELETE"))}
          />
          {!items.length && (
            <div className="empty">
              <History />
              <h2>Your next watch starts here</h2>
              <p>Videos you watch while signed in appear here.</p>
            </div>
          )}
        </>
      )}
      {tab === "collections" && (
        <>
          <form
            className="community-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api("/libraries", { name, kind });
                setName("");
              });
            }}
          >
            <input
              aria-label="Collection name"
              placeholder="Give it a name"
              maxLength={60}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              aria-label="Collection type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="collection">Private collection</option>
              <option value="playlist">Public creator playlist</option>
            </select>
            <button className="primary" disabled={busy}>
              <Plus size={16} />
              Create
            </button>
          </form>
          <p className="small-note">
            Collections are private. Playlists feature your own public videos,
            in the order you choose.
          </p>
          <div className="library-folders">
            {libraries.map((l) => (
              <button key={l.id} onClick={() => open(l)}>
                <Bookmark />
                <strong>{l.name}</strong>
                <small>
                  {l.kind === "playlist"
                    ? "Public playlist"
                    : "Private collection"}{" "}
                  · {l.count} videos
                </small>
              </button>
            ))}
          </div>
          {!libraries.length && (
            <div className="empty">
              <FolderPlus />
              <h2>A home for your favorites</h2>
              <p>
                Create your first collection above, then add videos from their
                options menu.
              </p>
            </div>
          )}
        </>
      )}
      {tab === "collection" && selected && (
        <>
          <div className="community-toolbar">
            <button
              className="text-button"
              onClick={() => {
                setSelected(null);
                setTab("collections");
              }}
            >
              ← All collections
            </button>
            <h2>{selected.name}</h2>
            <button
              className="secondary"
              onClick={() =>
                action(async () => {
                  await api(`/libraries/${selected.id}`, {}, "DELETE");
                  setSelected(null);
                  setTab("collections");
                })
              }
            >
              Delete {selected.kind}
            </button>
          </div>
          <form
            className="community-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("name");
              action(async () => {
                await api(
                  `/libraries/${selected.id}`,
                  { name: value },
                  "PATCH",
                );
                setSelected({ ...selected, name: value });
              });
            }}
          >
            <input
              name="name"
              aria-label="Rename collection"
              defaultValue={selected.name}
              maxLength={60}
              required
            />
            <button className="secondary" disabled={busy}>
              Rename
            </button>
          </form>
          <Tiles
            items={items}
            app={app}
            remove={(id) =>
              action(() =>
                api(`/libraries/${selected.id}/items/${id}`, {}, "DELETE"),
              )
            }
            move={
              !more && offset === 0
                ? (index) =>
                    action(async () => {
                      const ids = items.map((v) => v.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index],
                        ids[index - 1],
                      ];
                      await api(
                        `/libraries/${selected.id}/order`,
                        { ids },
                        "PUT",
                      );
                    })
                : null
            }
          />
          {!items.length && (
            <p className="small-note">
              Add a video from its options menu. Unavailable videos are hidden.
            </p>
          )}
        </>
      )}
      {more && ["history", "collection"].includes(tab) && (
        <button
          className="secondary more-button"
          onClick={() => setOffset((o) => o + 50)}
        >
          Load more
        </button>
      )}
    </section>
  );
}
export function Collect({ video, app, onClose }) {
  const [libraries, setLibraries] = useState([]),
    [name, setName] = useState(""),
    [kind, setKind] = useState("collection"),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/libraries")
      .then((d) => setLibraries(d.libraries))
      .catch((e) => app.notify(e.message));
  useEffect(() => {
    load();
  }, []);
  const add = async (id) => {
    setBusy(true);
    try {
      await api(`/libraries/${id}/items`, { video_id: video.id });
      app.notify("Added to your Library.");
      onClose();
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="collect-panel">
      <h2>Add to your Library</h2>
      <p className="small-note">
        Collections are private. Playlists contain your own public videos.
      </p>
      {libraries
        .filter(
          (l) =>
            l.kind === "collection" ||
            (video.user_id === app.user?.user_id && video.privacy === "public"),
        )
        .map((l) => (
          <button
            className="secondary"
            key={l.id}
            disabled={busy}
            onClick={() => add(l.id)}
          >
            {l.name} · {l.kind}
          </button>
        ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const d = await api("/libraries", { name, kind });
            await add(d.library.id);
          } catch (e) {
            app.notify(e.message);
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="New collection name"
          placeholder="New collection name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="New collection type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="collection">Private collection</option>
          {video.user_id === app.user?.user_id &&
            video.privacy === "public" && (
              <option value="playlist">Public playlist</option>
            )}
        </select>
        <button className="primary" disabled={busy}>
          Create and add
        </button>
      </form>
    </div>
  );
}
export function CreatorPlaylists({ username, app }) {
  const [lists, setLists] = useState([]),
    [selected, setSelected] = useState(null),
    [items, setItems] = useState([]),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    api(`/profiles/${username}/playlists`)
      .then((d) => setLists(d.libraries))
      .catch(() => {});
  }, [username]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api(`/libraries/${selected.id}?offset=${offset}`)
      .then((d) => {
        if (cancelled) return;
        setItems((old) => (offset ? [...old, ...d.videos] : d.videos));
        setMore(d.hasMore);
      })
      .catch((e) => app.notify(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected?.id, offset]);
  if (!lists.length) return null;
  return (
    <div className="creator-playlists">
      <h3>Creator playlists</h3>
      <div className="category-chips">
        {lists.map((l) => (
          <button
            key={l.id}
            className="secondary"
            onClick={() => {
              setItems([]);
              setOffset(0);
              setSelected(l);
            }}
          >
            {l.name} · {l.count}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <h3>
            {selected.name}{" "}
            <button className="text-button" onClick={() => setSelected(null)}>
              Close
            </button>
          </h3>
          <Tiles items={items} app={app} />
          {more && (
            <button
              className="secondary"
              onClick={() => setOffset((o) => o + 50)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function Chat({ app }) {
  const [chats, setChats] = useState([]),
    [target, setTarget] = useState(
      new URLSearchParams(location.search).get("to") || "",
    ),
    [thread, setThread] = useState(null),
    [name, setName] = useState(""),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [older, setOlder] = useState([]),
    [olderMore, setOlderMore] = useState(false);
  const end = useRef(null);
  const load = useCallback(async () => {
    if (!app.user) return;
    try {
      const c = await api("/chats");
      setChats(c.chats);
      if (target) {
        const t = await api(`/chats/${encodeURIComponent(target)}`);
        setThread(t);
        if (t.accepted)
          await api(`/chats/${encodeURIComponent(target)}/read`, {});
      }
    } catch (e) {
      setThread(null);
      setOlder([]);
      app.notify(e.message);
    }
  }, [app.user?.user_id, target]);
  useEffect(() => {
    setOlder([]);
    setOlderMore(false);
  }, [target]);
  useRefresh(load);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [thread?.messages?.length, target]);
  if (!app.user) return <SignIn app={app} />;
  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="content-page community-page">
      <div className="eyebrow">YOUR COMMUNITY</div>
      <h1>
        Conversations<span>.</span>
      </h1>
      <div className={`chat-layout ${target ? "has-thread" : ""}`}>
        <aside className="chat-list">
          <div className="profile-tabs">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={filter === "requests" ? "selected" : ""}
              onClick={() => setFilter("requests")}
            >
              Requests
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setThread(null);
              setTarget(name.replace(/^@/, ""));
              setReply(null);
            }}
          >
            <input
              aria-label="Message username"
              placeholder="Start with a username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={32}
            />
            <button className="secondary">
              <Plus size={18} />
            </button>
          </form>
          {chats
            .filter((c) => filter !== "requests" || c.request)
            .map((c) => (
              <button
                className={`chat-person ${target === c.username ? "selected" : ""}`}
                key={c.user_id}
                onClick={() => {
                  setThread(null);
                  setTarget(c.username);
                  setReply(null);
                  setBody("");
                }}
              >
                <strong>@{c.username}</strong>
                <small>{c.last.body || "Shared a video"}</small>
                <span>
                  {c.request ? "Message request" : c.muted ? "Muted" : ""}
                  {c.unread ? ` · ${c.unread} unread` : ""}
                </span>
              </button>
            ))}
          {!chats.length && (
            <p className="small-note">
              Start a conversation or share a video. New people arrive as
              message requests.
            </p>
          )}
        </aside>
        <div className="chat-thread">
          {target ? (
            <>
              <div className="community-toolbar">
                <button
                  className="text-button"
                  onClick={() => {
                    setTarget("");
                    setThread(null);
                  }}
                >
                  ← Conversations
                </button>
                <strong>@{target}</strong>
                <button
                  className="text-button"
                  onClick={() =>
                    action(() =>
                      api(`/chats/${target}/mute`, {
                        muted: !chats.find((c) => c.username === target)?.muted,
                      }),
                    )
                  }
                >
                  {chats.find((c) => c.username === target)?.muted
                    ? "Unmute"
                    : "Mute"}
                </button>
                <button
                  className="text-button"
                  onClick={() => app.navigate(`/@${target}`)}
                >
                  Profile
                </button>
              </div>
              {thread?.request && (
                <div className="verification-note">
                  <span>
                    This person wants to chat. Accept to enable read receipts.
                  </span>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      action(() => api(`/chats/${target}/accept`, {}))
                    }
                  >
                    Accept request
                  </button>
                </div>
              )}
              <div className="chat-messages" role="log" aria-label="Messages">
                {(older.length ? olderMore : thread?.hasMore) && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        const first = older[0]?.id || thread.messages[0]?.id;
                        const d = await api(
                          `/chats/${encodeURIComponent(target)}?before=${encodeURIComponent(first)}`,
                        );
                        setOlder((old) => [...d.messages, ...old]);
                        setOlderMore(d.hasMore);
                      })
                    }
                  >
                    Load earlier messages
                  </button>
                )}
                {[...older, ...(thread?.messages || [])].map((m) => (
                  <article
                    key={m.id}
                    className={`chat-bubble ${m.sender_id === app.user.user_id ? "outgoing" : ""}`}
                  >
                    {m.reply_id && (
                      <blockquote>
                        {[...older, ...thread.messages].find(
                          (r) => r.id === m.reply_id,
                        )?.body || "Reply to an earlier message"}
                      </blockquote>
                    )}
                    {m.body && <p>{m.body}</p>}
                    {m.video_id &&
                      (m.video ? (
                        <button
                          className="chat-video"
                          onClick={() => app.navigate(`/v/${m.video.id}`)}
                        >
                          <img src={m.video.thumbnail_url} alt="" />
                          <span>{m.video.caption}</span>
                        </button>
                      ) : (
                        <small>This video is unavailable.</small>
                      ))}
                    <small>
                      {new Date(
                        m.created_at.replace(" ", "T") + "Z",
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.sender_id === app.user.user_id && m.read_at
                        ? " · Read"
                        : ""}
                    </small>
                    <button className="text-button" onClick={() => setReply(m)}>
                      Reply
                    </button>
                  </article>
                ))}
                <div ref={end} />
              </div>
              {reply && (
                <div className="reply-preview">
                  Replying to: {reply.body || "Shared video"}{" "}
                  <button
                    aria-label="Cancel reply"
                    onClick={() => setReply(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  action(async () => {
                    await api(`/chats/${target}`, {
                      body,
                      ...(reply ? { reply_id: reply.id } : {}),
                    });
                    setBody("");
                    setReply(null);
                  });
                }}
              >
                <textarea
                  aria-label="Message"
                  value={body}
                  maxLength={2000}
                  rows={2}
                  placeholder="Write a message…"
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
                <button className="primary" disabled={busy || !body.trim()}>
                  <Send size={18} />
                  Send
                </button>
              </form>
              {thread && !thread.accepted && !thread.request && (
                <p className="small-note">
                  You can send up to three messages until this person accepts.
                </p>
              )}
            </>
          ) : (
            <div className="empty">
              <Send />
              <h2>A conversation starts with hello</h2>
              <p>Choose someone or enter a username.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
export function AccountSettings({ app }) {
  const [prefs, setPrefs] = useState(null),
    [push, setPush] = useState(null),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!app.user) return;
    api("/settings")
      .then((d) =>
        setPrefs({
          ...d.settings,
          history_enabled: !!d.settings.history_enabled,
          push_messages: !!d.settings.push_messages,
          push_replies: !!d.settings.push_replies,
          push_uploads: !!d.settings.push_uploads,
        }),
      )
      .catch((e) => app.notify(e.message));
    api("/push/config")
      .then(setPush)
      .catch((e) => app.notify(e.message));
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setEnabled(!!s));
  }, [app.user?.user_id]);
  if (!app.user) return <SignIn app={app} />;
  const save = async (next) => {
    setBusy(true);
    try {
      await api("/settings", next, "PUT");
      setPrefs(next);
      app.notify("Settings saved.");
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (enabled) {
        const s = await registration.pushManager.getSubscription();
        if (s) {
          await api("/push/subscriptions", { endpoint: s.endpoint }, "DELETE");
          await s.unsubscribe();
        }
        setEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "Notifications are blocked. You can change this in your browser settings.",
          );
        const raw = atob(push.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        const s = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await api("/push/subscriptions", s.toJSON());
        setEnabled(true);
        app.notify("Notifications enabled on this device.");
      }
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="content-page community-page">
      <div className="eyebrow">YOUR CHOICE</div>
      <h1>
        Privacy & notifications<span>.</span>
      </h1>
      <p className="subheading">Set your pace. Keep your community close.</p>
      {prefs && (
        <div className="settings-card">
          <h2>Messages</h2>
          <label>
            Who can message you?
            <select
              value={prefs.message_policy}
              disabled={busy}
              onChange={(e) =>
                save({ ...prefs, message_policy: e.target.value })
              }
            >
              <option value="requests">Everyone, with message requests</option>
              <option value="friends">
                Accepted chats and mutual followers
              </option>
              <option value="off">Nobody</option>
            </select>
          </label>
          <h2>Watch history</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={prefs.history_enabled}
              disabled={busy}
              onChange={(e) =>
                save({ ...prefs, history_enabled: e.target.checked })
              }
            />
            Save my watch history
          </label>
          <button
            className="text-button"
            onClick={() => app.navigate("/library")}
          >
            Manage or clear history
          </button>
          <h2>Push notifications</h2>
          <p className="small-note">
            Optional updates on this device. Message contents stay out of
            notifications. On iPhone, add Velo to your Home Screen first.
          </p>
          <button
            className="secondary"
            disabled={
              busy ||
              !push?.publicKey ||
              !("PushManager" in window) ||
              !("Notification" in window)
            }
            onClick={toggle}
          >
            {enabled ? "Disable on this device" : "Enable on this device"}
          </button>
          {!("PushManager" in window) && (
            <p className="small-note">
              This browser does not support push notifications.
            </p>
          )}
          {!push?.publicKey && (
            <p className="small-note">
              Notification setup is not yet available. Your in-app Inbox still
              works.
            </p>
          )}
          {[
            ["push_messages", "Messages"],
            ["push_replies", "Comments and replies"],
            ["push_uploads", "New uploads from creators I follow"],
          ].map(([key, label]) => (
            <label className="checkbox-label" key={key}>
              <input
                type="checkbox"
                checked={prefs[key]}
                disabled={busy}
                onChange={(e) => save({ ...prefs, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <label>
            Quiet time
            <select
              value={prefs.mute_until > Date.now() ? "muted" : "on"}
              disabled={busy}
              onChange={(e) =>
                save({
                  ...prefs,
                  mute_until:
                    e.target.value === "muted" ? Date.now() + 86400000 : 0,
                })
              }
            >
              <option value="on">Notifications on</option>
              <option value="muted">Mute for 24 hours</option>
            </select>
          </label>
          {prefs.mute_until > Date.now() && (
            <p className="small-note">
              Muted until {new Date(prefs.mute_until).toLocaleString()}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
