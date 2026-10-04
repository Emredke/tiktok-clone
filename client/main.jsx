import {
  Library,
  Chat,
  AccountSettings,
  Collect,
  CreatorPlaylists,
} from "./community.jsx";
import {
  CreationTools,
  Interests,
  Studio,
  Moderation,
  VideoExtras,
  formOptions,
} from "./features.jsx";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  Search,
  Plus,
  Inbox,
  User,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Volume2,
  VolumeX,
  Play,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  X,
  Check,
  ArrowUpRight,
  Music2,
  MoreHorizontal,
  Flag,
  ShieldOff,
  Trash2,
  Upload,
  Camera,
  LogOut,
  Settings,
  Send,
  Link,
  ArrowRight,
  LoaderCircle,
  Flame,
  Lock,
  Mail,
  Users,
  Sparkles,
} from "lucide-react";
import { api, uploadFile } from "./api";
import "./style.css";
const Context = createContext();
const useApp = () => useContext(Context);
const icons = {
  home: Home,
  discover: Search,
  create: Plus,
  inbox: Inbox,
  profile: User,
};
const descriptions = {
  follow: "followed you",
  like: "liked your video",
  comment: "commented on your video",
  reply: "replied to your comment",
  comment_like: "liked your comment",
  upload: "posted a new video",
};
const format = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "")}K` : String(n || 0);
function timeAgo(value) {
  const ms = Date.now() - Date.parse(value.replace(" ", "T") + "Z");
  return ms < 60000
    ? "just now"
    : ms < 3600000
      ? `${Math.floor(ms / 60000)}m`
      : ms < 86400000
        ? `${Math.floor(ms / 3600000)}h`
        : `${Math.floor(ms / 86400000)}d`;
}
function Avatar({ person, size = 42, onClick }) {
  const color = ["#fe8d72", "#a697ef", "#80c8bd", "#d398c5"][
    [...(person.username || "v")].reduce((a, c) => a + c.charCodeAt(0), 0) % 4
  ];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      className="avatar"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.35,
      }}
      onClick={onClick}
      aria-label={`Open ${person.username}'s profile`}
    >
      {person.avatar ? (
        <img src={`/api/avatars/${person.user_id}`} alt="" />
      ) : (
        (person.display_name || person.username || "V")
          .slice(0, 2)
          .toUpperCase()
      )}
    </Tag>
  );
}
function IconButton({
  icon: Icon,
  label,
  onClick,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      {...props}
    >
      <Icon size={24} />
      {children}
    </button>
  );
}
function Empty({ icon: Icon = Sparkles, title, body, children }) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </div>
  );
}
function Spinner() {
  return <LoaderCircle className="spin" size={24} aria-label="Loading" />;
}
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState(location.pathname + location.search),
    [auth, setAuth] = useState(null),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [unread, setUnread] = useState(0);
  const [config, setConfig] = useState({ categories: [] });
  const notify = useCallback((message) => setToast(message), []);
  const navigate = useCallback((path) => {
    history.pushState({}, "", path);
    setRoute(path);
    setModal(null);
  }, []);
  const run = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e.status === 401) setAuth("login");
        notify(e.message);
        return null;
      }
    },
    [notify],
  );
  const requireUser = (fn) => (user ? run(fn) : setAuth("login"));
  useEffect(() => {
    const pop = () => setRoute(location.pathname + location.search);
    addEventListener("popstate", pop);
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch((e) => notify(e.message))
      .finally(() => setReady(true));
    api("/config")
      .then(setConfig)
      .catch((e) => notify(e.message));
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("verify"))
      run(async () => {
        await api("/auth/verify", { token: p.get("verify") });
        const d = await api("/auth/me");
        setUser(d.user);
        notify("Email verified. You’re ready to post.");
        history.replaceState({}, "", location.pathname);
      });
    if (p.has("reset")) setAuth("reset");
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    const refresh = () =>
      api("/inbox")
        .then((d) =>
          setUnread(
            [...d.notifications, ...d.messages].filter((n) => !n.read_at)
              .length,
          ),
        )
        .catch(() => {});
    refresh();
    const events = new EventSource("/api/live");
    events.addEventListener("refresh", () => {
      refresh();
      window.dispatchEvent(new Event("velo-refresh"));
    });
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    return () => {
      clearInterval(id);
      events.close();
    };
  }, [user]);
  const value = {
    user,
    setUser,
    config,
    navigate,
    notify,
    run,
    requireUser,
    setAuth,
    setModal,
    setUnread,
  };
  const pathname = route.split("?")[0];
  let page = [
    "/studio",
    "/moderation",
    "/preferences",
    "/library",
    "/chat",
    "/settings",
  ].includes(pathname)
    ? pathname.slice(1)
    : pathname === "/discover"
      ? "discover"
      : pathname === "/create"
        ? "create"
        : pathname === "/inbox"
          ? "inbox"
          : pathname.startsWith("/@")
            ? "profile"
            : "home";
  const nav = (page) =>
    page === "profile"
      ? user
        ? navigate(`/@${user.username}`)
        : setAuth("login")
      : navigate(page === "home" ? "/" : `/${page}`);
  return (
    <Context.Provider value={value}>
      <div className="app">
        <aside className="sidebar">
          <button className="brand" onClick={() => navigate("/")}>
            <span className="brand-mark">v</span>velo
            <span className="brand-dot">.</span>
          </button>
          <div className="sidebar-intro">Find your next obsession.</div>
          <nav>
            {Object.entries(icons).map(([key, Icon]) => (
              <button
                key={key}
                className={`nav-item ${page === key ? "active" : ""} ${key === "create" ? "nav-create" : ""}`}
                onClick={() => nav(key)}
              >
                <Icon size={23} />
                <span>
                  {key === "create"
                    ? "Create"
                    : key[0].toUpperCase() + key.slice(1)}
                </span>
                {key === "inbox" && unread > 0 && (
                  <span className="badge">{unread}</span>
                )}
              </button>
            ))}
          </nav>
          {user && (
            <div className="extra-nav">
              <button onClick={() => navigate("/library")}>
                <Bookmark size={19} />
                Your Library
              </button>
              <button onClick={() => navigate("/chat")}>
                <Send size={19} />
                Conversations
              </button>
              <button onClick={() => navigate("/settings")}>
                <Settings size={19} />
                Privacy & notifications
              </button>
              <button onClick={() => navigate("/studio")}>
                <Camera size={19} />
                Creator Studio
              </button>
              <button onClick={() => navigate("/preferences")}>
                <Settings size={19} />
                Feed preferences
              </button>
              {user.role === "admin" && (
                <button onClick={() => navigate("/moderation")}>
                  <Flag size={19} />
                  Moderation
                </button>
              )}
            </div>
          )}
          <div className="sidebar-bottom">
            {user ? (
              <button className="account" onClick={() => nav("profile")}>
                <Avatar person={user} size={36} />
                <span>
                  <strong>{user.display_name}</strong>
                  <small>@{user.username}</small>
                </span>
                <ChevronDown size={16} />
              </button>
            ) : (
              <>
                <h3>Your people are here.</h3>
                <p>Make it yours. Save what you love.</p>
                <button className="primary" onClick={() => setAuth("signup")}>
                  Join Velo <ArrowRight size={16} />
                </button>
              </>
            )}
            <div className="sidebar-footer">
              Original moments. Real connections.
              <br />
              Velo © 2026 · Demo creators are fictional.
            </div>
          </div>
        </aside>
        <main className={`main ${page === "home" ? "feed-main" : ""}`}>
          {!ready ? (
            <div className="loading-page">
              <Spinner />
            </div>
          ) : page === "home" ? (
            <Feed
              key={route + "-" + (user?.user_id || "guest")}
              videoId={pathname.startsWith("/v/") ? pathname.slice(3) : null}
            />
          ) : page === "library" ? (
            <Library app={value} />
          ) : page === "chat" ? (
            <Chat app={value} />
          ) : page === "settings" ? (
            <AccountSettings app={value} />
          ) : page === "discover" ? (
            <Discover key={route} />
          ) : page === "studio" ? (
            <Studio app={value} />
          ) : page === "moderation" ? (
            <Moderation app={value} />
          ) : page === "preferences" ? (
            <section className="content-page">
              <Interests app={value} />
            </section>
          ) : page === "create" ? (
            <Create key={route} />
          ) : page === "inbox" ? (
            <Notifications />
          ) : (
            <Profile
              key={route}
              username={decodeURIComponent(route.slice(2))}
            />
          )}
        </main>
        <nav className="bottom-nav">
          {Object.entries(icons).map(([key, Icon]) => (
            <button
              key={key}
              className={`${page === key ? "active" : ""} ${key === "create" ? "create-button" : ""}`}
              aria-label={
                key === "create"
                  ? "Create video"
                  : key[0].toUpperCase() + key.slice(1)
              }
              onClick={() => nav(key)}
            >
              <Icon size={key === "create" ? 28 : 23} />
              {key !== "create" && (
                <span>{key[0].toUpperCase() + key.slice(1)}</span>
              )}
              {key === "inbox" && unread > 0 && <i />}
            </button>
          ))}
        </nav>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        {auth && (
          <Auth mode={auth} setMode={setAuth} onClose={() => setAuth(null)} />
        )}
        {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
        {ready && user && !user.onboarded && !auth && (
          <div className="modal-backdrop">
            <section
              className="sheet onboarding-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Choose your interests"
            >
              <Interests app={value} onboarding onDone={() => {}} />
            </section>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
function Feed({ videoId }) {
  const { user, run, notify, navigate } = useApp();
  const [mode, setMode] = useState("foryou"),
    [items, setItems] = useState([]),
    [active, setActive] = useState(0),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(true),
    [error, setError] = useState("");
  const scroller = useRef(),
    busy = useRef(false),
    seen = useRef([]),
    epoch = useRef(0);
  const load = useCallback(
    async (reset = false) => {
      if (busy.current && !reset) return;
      const version = reset ? ++epoch.current : epoch.current;
      busy.current = true;
      setLoading(true);
      setError("");
      if (reset) {
        seen.current = [];
        setItems([]);
        setActive(0);
        scroller.current?.scrollTo({ top: 0 });
      }
      try {
        let list = [],
          hasMore = false;
        if (videoId && reset) {
          const d = await api(`/videos/${videoId}`);
          list = [d.video];
        } else {
          const d = await api(
            `/feed?mode=${mode}&exclude=${seen.current.join(",")}`,
          );
          list = d.videos;
          hasMore = d.hasMore;
        }
        if (version !== epoch.current) return;
        const unique = list.filter((v) => !seen.current.includes(v.id));
        seen.current.push(...unique.map((v) => v.id));
        setItems((v) => (reset ? unique : [...v, ...unique]));
        setMore(hasMore);
      } catch (e) {
        if (version === epoch.current) {
          setError(e.message);
          notify(e.message);
        }
      } finally {
        if (version === epoch.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [mode, videoId, notify],
  );
  useEffect(() => {
    load(true);
  }, [load]);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting && e.intersectionRatio > 0.6)
            setActive(Number(e.target.dataset.index));
      },
      { root, threshold: [0.6, 0.8] },
    );
    root.querySelectorAll(".video-card").forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items.length]);
  useEffect(() => {
    if (active >= items.length - 3 && items.length && more) load();
  }, [active, items.length, more, load]);
  const step = (direction) =>
    scroller.current?.children[
      Math.max(0, Math.min(items.length - 1, active + direction))
    ]?.scrollIntoView({ behavior: "smooth", block: "start" });
  useEffect(() => {
    const handler = (e) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
        document.querySelector(".modal-backdrop")
      )
        return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, [active, items.length]);
  const patch = (id, changes) =>
    setItems((v) =>
      v.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  return (
    <div className="feed-layout">
      <section className="video-stage">
        <header className="feed-header">
          <span className="mobile-brand">velo.</span>
          <div className="feed-tabs">
            <button
              className={mode === "following" ? "selected" : ""}
              onClick={() => setMode("following")}
            >
              Following
            </button>
            <button
              className={mode === "foryou" ? "selected" : ""}
              onClick={() => setMode("foryou")}
            >
              For You
            </button>
          </div>
          <IconButton
            icon={Search}
            label="Search videos"
            className="mobile-search"
            onClick={() => navigate("/discover")}
          />
        </header>
        <div className="feed-scroller" ref={scroller} aria-label="Video feed">
          {items.map((v, i) => (
            <VideoCard
              key={v.id}
              video={v}
              active={active === i}
              nearby={Math.abs(active - i) <= 1}
              index={i}
              patch={patch}
            />
          ))}
          {!items.length && !loading && (
            <Empty
              title={
                error
                  ? "Unable to load videos"
                  : mode === "following"
                    ? "A feed full of your favorites"
                    : "Nothing here yet"
              }
              body={
                error || "Follow a creator to see their latest videos here."
              }
            >
              {error && (
                <button className="primary" onClick={() => load(true)}>
                  Try again
                </button>
              )}
            </Empty>
          )}
          {loading && !items.length && (
            <div className="feed-loading">
              <Spinner />
              <span>Finding your next obsession…</span>
            </div>
          )}
          {loading && items.length > 0 && (
            <div className="load-more">
              <Spinner />
            </div>
          )}
        </div>
        <div className="feed-arrows">
          <IconButton
            icon={ChevronUp}
            label="Previous video"
            onClick={() => step(-1)}
          />
          <IconButton
            icon={ChevronDown}
            label="Next video"
            onClick={() => step(1)}
          />
        </div>
      </section>
      <FeedAside active={items[active]} />
    </div>
  );
}
function VideoCard({ video: v, active, nearby, index, patch }) {
  const { user, navigate, requireUser, setModal, notify } = useApp();
  const ref = useRef(),
    timer = useRef(),
    meter = useRef({ seconds: 0, completion: 0, loops: 0, last: 0, time: 0 });
  const [muted, setMuted] = useState(true),
    [buffering, setBuffering] = useState(true),
    [needsPlay, setNeedsPlay] = useState(false),
    [burst, setBurst] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [playError, setPlayError] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const resumed = useRef(false);
  useEffect(() => {
    const video = ref.current;
    if (!video || !nearby || !v.hls_url) return;
    let hls,
      cancelled = false;
    if (video.canPlayType("application/vnd.apple.mpegurl"))
      video.src = v.hls_url;
    else
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            hls = new Hls({
              enableWorker: false,
              startLevel: 0,
              maxBufferLength: 10,
              maxMaxBufferLength: 20,
            });
            hls.loadSource(v.hls_url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_, d) => {
              if (d.fatal) {
                hls.destroy();
                video.src = v.video_url;
                video.play().catch(() => {});
              }
            });
          } else video.src = v.video_url;
        })
        .catch(() => {
          if (!cancelled) video.src = v.video_url;
        });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [nearby, v.id, v.hls_url]);
  useEffect(() => {
    if (ref.current?.textTracks?.[0])
      ref.current.textTracks[0].mode = captionsOn ? "showing" : "hidden";
  }, [captionsOn, v.captions_url]);
  const flush = useCallback(() => {
    const m = meter.current;
    if (m.seconds > 0.25) {
      fetch(`/api/videos/${v.id}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: Math.min(
            180,
            Math.max(0, ref.current?.currentTime ?? m.time),
          ),
          watch_seconds: Math.min(3600, m.seconds),
          completion: m.completion,
          rewatches: Math.min(100, m.loops),
          skip_seconds: Math.min(3600, m.seconds),
        }),
        keepalive: true,
      }).catch(() => {});
    }
    meter.current = { seconds: 0, completion: 0, loops: 0, last: 0, time: 0 };
  }, [v.id]);
  useEffect(() => {
    const el = ref.current;
    if (active) {
      el?.play()
        .then(() => setNeedsPlay(false))
        .catch(() => setNeedsPlay(true));
    } else {
      el?.pause();
      flush();
    }
    return () => {
      el?.pause();
      if (active) flush();
    };
  }, [active, flush]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        ref.current?.pause();
        flush();
      } else if (active) ref.current?.play().catch(() => setNeedsPlay(true));
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [active, flush]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const updateMeter = () => {
    const el = ref.current;
    if (!active || !el || el.paused) return;
    const m = meter.current,
      now = performance.now();
    if (m.last) m.seconds += Math.max(0, Math.min(0.5, (now - m.last) / 1000));
    m.last = now;
    if (el.currentTime < m.time - 1) m.loops++;
    m.time = el.currentTime;
    m.completion = Math.max(
      m.completion,
      Math.min(1, el.currentTime / (el.duration || v.duration)),
    );
    setProgress((el.currentTime / (el.duration || v.duration)) * 100);
  };
  const like = (force = false) =>
    requireUser(async () => {
      if (busy || (force && v.liked)) return;
      const target = force ? true : !v.liked;
      setBusy(true);
      patch(v.id, {
        liked: target,
        likes_count: v.likes_count + (target ? 1 : -1),
      });
      try {
        const d = await api(`/videos/${v.id}/like`, { active: target });
        patch(v.id, { liked: d.liked, likes_count: d.count });
      } catch (e) {
        patch(v.id, { liked: v.liked, likes_count: v.likes_count });
        throw e;
      } finally {
        setBusy(false);
      }
    });
  const save = () =>
    requireUser(async () => {
      const target = !v.saved;
      patch(v.id, {
        saved: target,
        saves_count: v.saves_count + (target ? 1 : -1),
      });
      try {
        const d = await api(`/videos/${v.id}/save`, { active: target });
        patch(v.id, { saved: d.saved, saves_count: d.count });
      } catch (e) {
        patch(v.id, { saved: v.saved, saves_count: v.saves_count });
        throw e;
      }
    });
  const follow = () =>
    requireUser(async () => {
      const d = await api(`/profiles/${v.username}/follow`, {
        active: !v.following,
        video_id: v.id,
      });
      patch(v.id, { following: d.profile.is_following });
    });
  const tap = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMuted((m) => !m);
      if (ref.current?.paused)
        ref.current.play().catch(() => setNeedsPlay(true));
    }, 230);
  };
  const doubleTap = () => {
    clearTimeout(timer.current);
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    like(true);
  };
  return (
    <article className="video-card" data-index={index} data-video-id={v.id}>
      <video
        ref={ref}
        src={nearby && !v.hls_url ? v.video_url : undefined}
        poster={v.thumbnail_url}
        loop
        playsInline
        muted={muted}
        preload={active ? "auto" : nearby ? "auto" : "none"}
        onClick={tap}
        onDoubleClick={doubleTap}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          setNeedsPlay(false);
        }}
        onLoadedMetadata={(e) => {
          if (resumed.current || location.pathname !== `/v/${v.id}`) return;
          const position = Number(
            new URLSearchParams(location.search).get("resume"),
          );
          if (Number.isFinite(position) && position > 0) {
            e.currentTarget.currentTime = Math.min(
              position,
              Math.max(0, e.currentTarget.duration - 0.1),
            );
            resumed.current = true;
          }
        }}
        onLoadedData={() => {
          setBuffering(false);
          if (active) ref.current?.play().catch(() => setNeedsPlay(true));
        }}
        onError={() => {
          if (nearby) setPlayError(true);
        }}
        onPause={() => {
          meter.current.last = 0;
        }}
        onTimeUpdate={updateMeter}
      >
        {v.captions_url && (
          <track
            kind="captions"
            src={v.captions_url}
            srcLang="en"
            label="Speech captions"
            default={captionsOn}
          />
        )}
      </video>
      <div className="video-shade" />
      {buffering && active && !playError && (
        <div className="video-spinner">
          <Spinner />
        </div>
      )}
      {needsPlay && active && (
        <button
          className="play-overlay"
          aria-label="Play video"
          onClick={() =>
            ref.current?.play().catch(() => notify("Playback unavailable."))
          }
        >
          <Play fill="white" size={42} />
        </button>
      )}
      {playError && (
        <div className="video-error">
          <p>Playback unavailable</p>
          <button
            onClick={() => {
              setPlayError(false);
              ref.current?.load();
              ref.current?.play().catch(() => {});
            }}
          >
            Retry playback
          </button>
        </div>
      )}
      {burst && (
        <Heart className="heart-burst" fill="#fff" strokeWidth={0} size={110} />
      )}
      <div className="video-top">
        {v.captions_url && (
          <button
            className="caption-toggle"
            aria-label="Toggle captions"
            aria-pressed={captionsOn}
            onClick={() => setCaptionsOn((x) => !x)}
          >
            CC
          </button>
        )}
        <span className="original-label">
          <span />{" "}
          {v.source
            ? "REAL FOOTAGE · OPEN ARCHIVE"
            : v.demo
              ? "VELO ORIGINALS"
              : v.category.toUpperCase()}
        </span>
        <IconButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? "Unmute video" : "Mute video"}
          onClick={() => setMuted((m) => !m)}
        />
      </div>
      <div className="video-actions">
        <div className="creator-follow">
          <Avatar
            person={v}
            size={47}
            onClick={() => navigate(`/@${v.username}`)}
          />
          {v.user_id !== user?.user_id && (
            <button
              className={`follow-mini ${v.following ? "is-following" : ""}`}
              aria-label={v.following ? "Unfollow creator" : "Follow creator"}
              onClick={follow}
            >
              {v.following ? <Check size={12} /> : <Plus size={14} />}
            </button>
          )}
        </div>
        <button
          className={`video-action ${v.liked ? "liked" : ""}`}
          aria-label={v.liked ? "Unlike video" : "Like video"}
          onClick={() => like()}
          disabled={busy}
        >
          <Heart size={31} fill={v.liked ? "currentColor" : "white"} />
          <span>{format(v.likes_count)}</span>
        </button>
        <button
          className="video-action"
          aria-label="Open comments"
          onClick={() => setModal({ type: "comments", video: v, patch })}
        >
          <MessageCircle size={31} fill="white" />
          <span>{format(v.comments_count)}</span>
        </button>
        <button
          className={`video-action ${v.saved ? "saved" : ""}`}
          aria-label={v.saved ? "Unsave video" : "Save video"}
          onClick={save}
        >
          <Bookmark size={29} fill={v.saved ? "currentColor" : "white"} />
          <span>{format(v.saves_count)}</span>
        </button>
        <button
          className="video-action"
          aria-label="Share video"
          onClick={() => setModal({ type: "share", video: v, patch })}
        >
          <Share2 size={30} />
          <span>{format(v.shares_count)}</span>
        </button>
        <button
          className="record-disc"
          aria-label="Show creator profile"
          onClick={() => navigate(`/@${v.username}`)}
        >
          <Music2 size={18} />
        </button>
      </div>
      <div className="video-caption">
        <button
          className="creator-name"
          onClick={() => navigate(`/@${v.username}`)}
        >
          @{v.username} <span>{v.demo ? "demo creator" : ""}</span>
        </button>
        <p>{v.caption.split("#")[0]}</p>
        <div className="hashtags">
          {v.hashtags.map((tag) => (
            <button
              key={tag}
              onClick={() =>
                navigate(`/discover?q=${encodeURIComponent("#" + tag)}`)
              }
            >
              #{tag}
            </button>
          ))}
        </div>
        {v.source && (
          <a
            className="inline-credit"
            href={v.source.page}
            target="_blank"
            rel="noreferrer"
          >
            Footage: {v.source.author} · {v.source.license}
          </a>
        )}
        {v.parent && (
          <button
            className="inline-credit"
            onClick={() => navigate(`/v/${v.parent.id}`)}
          >
            {v.remix_mode === "duet" ? "Duet" : "Remix"} · watch original
          </button>
        )}
        <div className="audio-row">
          <Music2 size={14} />
          <span>{v.audio}</span>
          <IconButton
            icon={MoreHorizontal}
            label="Video options"
            onClick={() => setModal({ type: "options", video: v, patch })}
          />
        </div>
      </div>
      <div className="play-progress" style={{ width: `${progress}%` }} />
    </article>
  );
}
function FeedAside({ active }) {
  const { navigate, run } = useApp();
  const [tags, setTags] = useState([]);
  useEffect(() => {
    api("/discover")
      .then((d) => setTags(d.hashtags.slice(0, 5)))
      .catch(() => {});
  }, []);
  return (
    <aside className="feed-aside">
      <div className="eyebrow">THE DAILY SCROLL</div>
      <h1>
        A little
        <br />
        curiosity.
        <br />
        <em>A lot to love.</em>
      </h1>
      <p>
        Good things happen when you
        <br />
        follow what moves you.
      </p>
      <div className="aside-divider" />
      <div className="aside-label">
        <Flame size={16} /> In the loop
      </div>
      {tags.map((t, i) => (
        <button
          className="trending-tag"
          key={t.name}
          onClick={() =>
            navigate(`/discover?q=${encodeURIComponent("#" + t.name)}`)
          }
        >
          <span className="tag-number">0{i + 1}</span>
          <span>
            <strong>#{t.name}</strong>
            <small>{t.videos_count} videos</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
      ))}
      <div className="aside-note">
        <span className="live-dot" /> MADE FOR YOUR KIND OF CURIOUS
      </div>
      <p className="demo-note">
        Explore real footage with credits, original motion studies, and your
        community’s moments. Add yours with Create.
      </p>
    </aside>
  );
}
function Discover() {
  const { navigate, config, notify } = useApp();
  const [q, setQ] = useState(
      new URLSearchParams(location.search).get("q") || "",
    ),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [q]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        api(`/discover?q=${encodeURIComponent(q)}&offset=${offset}`)
          .then((d) => {
            if (alive)
              setData((old) =>
                offset
                  ? {
                      ...d,
                      videos: [...(old?.videos || []), ...d.videos],
                      profiles: [...(old?.profiles || []), ...d.profiles],
                    }
                  : d,
              );
          })
          .catch((e) => notify(e.message))
          .finally(() => {
            if (alive) setLoading(false);
          }),
      250,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, offset]);
  return (
    <section className="content-page discover">
      <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
      <h1>
        Find your thing<span>.</span>
      </h1>
      <p className="subheading">Fresh perspectives. New favorites. All here.</p>
      <label className="search-field">
        <Search size={21} />
        <input
          placeholder="Search creators, videos, or #hashtags"
          aria-label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <IconButton icon={X} label="Clear search" onClick={() => setQ("")} />
        )}
      </label>
      <div className="category-chips">
        <button className={!q ? "selected" : ""} onClick={() => setQ("")}>
          For you
        </button>
        {config.categories.map((c) => (
          <button
            className={q === c ? "selected" : ""}
            key={c}
            onClick={() => setQ(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {!q && data && (
        <div className="trending-strip">
          {data.hashtags.slice(0, 6).map((t) => (
            <button key={t.name} onClick={() => setQ("#" + t.name)}>
              <span>#</span>
              <strong>{t.name}</strong>
              <small>{t.videos_count} videos</small>
            </button>
          ))}
        </div>
      )}
      <div className="section-title">
        <h2>{q ? "Search results" : "Worth a watch"}</h2>
        {loading && <Spinner />}
      </div>
      <VideoGrid videos={data?.videos || []} />
      {data && !data.videos.length && !loading && (
        <Empty
          icon={Search}
          title="No videos found"
          body="Try another caption, category, or hashtag."
        />
      )}
      {data?.profiles.length > 0 && (
        <>
          <div className="section-title">
            <h2>{q ? "Creators" : "Meet the studios"}</h2>
          </div>
          <div className="creator-grid">
            {data.profiles.map((p) => (
              <button
                className="creator-tile"
                key={p.user_id}
                onClick={() => navigate(`/@${p.username}`)}
              >
                <Avatar person={p} size={48} />
                <span>
                  <strong>{p.display_name}</strong>
                  <small>@{p.username}</small>
                  {p.demo === 1 && <small>Fictional demo creator</small>}
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {data?.hasMore && (
        <button
          className="secondary more-button"
          disabled={loading}
          onClick={() => setOffset((o) => o + 24)}
        >
          Load more
        </button>
      )}
    </section>
  );
}
function VideoGrid({ videos }) {
  const { navigate } = useApp();
  return (
    <div className="video-grid">
      {videos.map((v) => (
        <button
          className="video-tile"
          key={v.id}
          onClick={() => navigate(`/v/${v.id}`)}
        >
          <img src={v.thumbnail_url} loading="lazy" alt={v.caption} />
          <div className="tile-shade" />
          <span className="tile-category">{v.category}</span>
          <div className="tile-caption">
            <strong>{v.caption.split("#")[0]}</strong>
            <span>
              <Play size={12} />
              {format(v.views_count)} <Heart size={12} />
              {format(v.likes_count)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
function Auth({ mode, setMode, onClose }) {
  const { setUser, notify, run, config } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const titles = {
    login: "Welcome back.",
    signup: "Find your people.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
  };
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const b = Object.fromEntries(new FormData(e.target));
    try {
      const endpoint =
        mode === "signup"
          ? "/auth/signup"
          : mode === "forgot"
            ? "/auth/forgot"
            : mode === "reset"
              ? "/auth/reset"
              : "/auth/login";
      if (mode === "reset")
        b.token = new URLSearchParams(location.search).get("reset");
      const d = await api(endpoint, b);
      if (d.user) {
        setUser(d.user);
        onClose();
      } else if (mode === "forgot") {
        notify(d.message);
        setMode("login");
      } else {
        notify("Password updated. Sign in with your new password.");
        history.replaceState({}, "", location.pathname);
        setMode("login");
      }
      if (mode === "signup")
        notify(
          config.mailMode === "development"
            ? "Account created. Open the verification link in data/mail (local development)."
            : d.message,
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-label={titles[mode]}
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          icon={X}
          label="Close"
          className="modal-close"
          onClick={onClose}
        />
        <div className="brand auth-brand">
          velo<span className="brand-dot">.</span>
        </div>
        <h1>{titles[mode]}</h1>
        <p>
          {mode === "signup"
            ? "Your next obsession is one scroll away."
            : "Your moments, your favorites, your community."}
        </p>
        <form onSubmit={submit} key={mode}>
          {mode === "signup" && (
            <>
              <label>
                Display name
                <input
                  name="display_name"
                  required
                  maxLength={50}
                  autoComplete="name"
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  required
                  pattern="[a-zA-Z0-9_]{3,24}"
                  maxLength={24}
                  autoComplete="username"
                  placeholder="your_name"
                />
              </label>
            </>
          )}
          {mode !== "reset" && (
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                aria-label="Password"
                name="password"
                type="password"
                required
                minLength={mode === "login" ? 1 : 10}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              {mode !== "login" && <small>At least 10 characters.</small>}
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : mode === "signup" ? (
              "Create account"
            ) : mode === "forgot" ? (
              "Send reset link"
            ) : mode === "reset" ? (
              "Update password"
            ) : (
              "Sign in"
            )}
            <ArrowRight size={17} />
          </button>
        </form>
        {mode === "login" && (
          <button className="text-button" onClick={() => setMode("forgot")}>
            Forgot password?
          </button>
        )}
        <div className="auth-switch">
          {mode === "signup" ? "Already part of the loop?" : "New around here?"}{" "}
          <button
            onClick={() => {
              setError("");
              setMode(mode === "signup" ? "login" : "signup");
            }}
          >
            {mode === "signup" ? "Sign in" : "Join Velo"}
          </button>
        </div>
      </section>
    </div>
  );
}
function Profile({ username }) {
  const profileApp = useApp();
  const { user, setUser, run, requireUser, navigate, setModal, notify } =
    useApp();
  const [p, setP] = useState(null),
    [items, setItems] = useState([]),
    [tab, setTab] = useState("uploads"),
    [offset, setOffset] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [error, setError] = useState("");
  const owner = user?.username === username;
  const load = () =>
    api(`/profiles/${encodeURIComponent(username)}`)
      .then((d) => setP(d.profile))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [username]);
  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [tab]);
  useEffect(() => {
    let alive = true;
    api(
      `/profiles/${encodeURIComponent(username)}/videos?tab=${tab}&offset=${offset}`,
    )
      .then((d) => {
        if (alive) {
          setItems((v) => (offset ? [...v, ...d.videos] : d.videos));
          setHasMore(d.hasMore);
        }
      })
      .catch((e) => notify(e.message));
    return () => {
      alive = false;
    };
  }, [username, tab, offset]);
  if (error)
    return <Empty icon={User} title="Profile unavailable" body={error} />;
  if (!p)
    return (
      <div className="loading-page">
        <Spinner />
      </div>
    );
  return (
    <section className="content-page profile-page">
      <div className="page-top">
        <button className="back-button" onClick={() => navigate("/")}>
          <ChevronLeft size={18} />
          Back to feed
        </button>
        {owner ? (
          <div className="profile-menu">
            <IconButton
              icon={ShieldOff}
              label="Blocked accounts"
              onClick={() => setModal({ type: "blocks" })}
            />
            <IconButton
              icon={LogOut}
              label="Log out"
              onClick={() =>
                run(async () => {
                  if ("serviceWorker" in navigator) {
                    const registration =
                      await navigator.serviceWorker.getRegistration();
                    const subscription =
                      await registration?.pushManager.getSubscription();
                    if (subscription) {
                      await api(
                        "/push/subscriptions",
                        { endpoint: subscription.endpoint },
                        "DELETE",
                      );
                      await subscription.unsubscribe();
                    }
                  }
                  await api("/auth/logout", {});
                  setUser(null);
                  navigate("/");
                  notify("You’ve signed out.");
                })
              }
            />
          </div>
        ) : (
          <IconButton
            icon={MoreHorizontal}
            label="Profile options"
            onClick={() => setModal({ type: "userOptions", profile: p })}
          />
        )}
      </div>
      {owner && (
        <div className="profile-tools">
          <button className="secondary" onClick={() => navigate("/library")}>
            Your Library
          </button>
          <button className="secondary" onClick={() => navigate("/settings")}>
            Privacy & notifications
          </button>
          <button className="secondary" onClick={() => navigate("/studio")}>
            Creator Studio
          </button>
          <button
            className="secondary"
            onClick={() => navigate("/preferences")}
          >
            Feed preferences
          </button>
          {user.role === "admin" && (
            <button
              className="secondary"
              onClick={() => navigate("/moderation")}
            >
              Moderation
            </button>
          )}
        </div>
      )}
      {!owner && user && (
        <button
          className="secondary"
          onClick={() => navigate(`/chat?to=${encodeURIComponent(p.username)}`)}
        >
          <Send size={16} />
          Message
        </button>
      )}
      <CreatorPlaylists username={username} app={profileApp} />
      <div className="profile-header">
        <Avatar person={p} size={104} />
        <div>
          <div className="eyebrow">
            {p.demo ? "FICTIONAL DEMO CREATOR" : "CREATOR"}
          </div>
          <h1>{p.display_name}</h1>
          <p className="profile-handle">@{p.username}</p>
        </div>
        {owner ? (
          <button
            className="secondary"
            onClick={() =>
              setModal({
                type: "edit",
                profile: p,
                onSave: (updated) => setP((old) => ({ ...old, ...updated })),
              })
            }
          >
            <Settings size={16} /> Edit profile
          </button>
        ) : (
          <button
            className={`primary ${p.is_following ? "following-button" : ""}`}
            onClick={() =>
              requireUser(async () => {
                const d = await api(`/profiles/${p.username}/follow`, {
                  active: !p.is_following,
                });
                setP(d.profile);
              })
            }
          >
            {p.is_following ? (
              <>
                <Check size={17} /> Following
              </>
            ) : (
              <>
                <Plus size={17} /> Follow
              </>
            )}
          </button>
        )}
      </div>
      <div className="profile-stats">
        <button
          onClick={() =>
            setModal({
              type: "connections",
              profile: p,
              connection: "following",
            })
          }
        >
          <strong>{format(p.following)}</strong>Following
        </button>
        <button
          onClick={() =>
            setModal({
              type: "connections",
              profile: p,
              connection: "followers",
            })
          }
        >
          <strong>{format(p.followers)}</strong>Followers
        </button>
        <span>
          <strong>{format(p.total_likes)}</strong>Likes
        </span>
        <span>
          <strong>{format(p.video_count ?? 0)}</strong>Videos
        </span>
      </div>
      <p className="profile-bio">
        {p.bio || "A new perspective. A story to tell."}
      </p>
      {owner && !user.verified && (
        <div className="verification-note">
          <Mail size={19} />
          <span>Verify your email to upload and send videos.</span>
          <button
            onClick={() =>
              run(async () => {
                const d = await api("/auth/resend", {});
                notify(d.message);
              })
            }
          >
            Resend link
          </button>
        </div>
      )}
      <div className="profile-tabs">
        {["uploads", "liked", ...(owner ? ["saved"] : [])].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "uploads" ? "Videos" : t === "liked" ? "Liked" : "Saved"}
            {t === "saved" && <Lock size={13} />}
          </button>
        ))}
      </div>
      <VideoGrid videos={items} />
      {!items.length && (
        <Empty
          icon={tab === "saved" ? Bookmark : Play}
          title={
            tab === "uploads"
              ? "Your story starts here"
              : tab === "liked"
                ? "Your favorites live here"
                : "Keep the good ones close"
          }
          body={
            tab === "uploads"
              ? "Post a video and make your first connection."
              : "Watch the feed and add videos to this collection."
          }
        >
          {owner && tab === "uploads" && (
            <button className="primary" onClick={() => navigate("/create")}>
              Create a video <Plus size={16} />
            </button>
          )}
        </Empty>
      )}
      {hasMore && (
        <button
          className="secondary more-button"
          onClick={() => setOffset((o) => o + 24)}
        >
          Load more
        </button>
      )}
    </section>
  );
}
function Notifications() {
  const { user, setAuth, navigate, setUnread, notify } = useApp();
  const [data, setData] = useState(null),
    [tab, setTab] = useState("activity"),
    [offset, setOffset] = useState(0);
  const load = () =>
    api(`/inbox?offset=${offset}`)
      .then((d) => {
        setData((old) =>
          offset
            ? {
                ...d,
                notifications: [
                  ...(old?.notifications || []),
                  ...d.notifications,
                ],
                messages: [...(old?.messages || []), ...d.messages],
              }
            : d,
        );
      })
      .catch((e) => notify(e.message));
  useEffect(() => {
    if (user) load();
  }, [user, offset]);
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (!document.hidden && offset === 0) load();
    }, 15000);
    return () => clearInterval(id);
  }, [user, offset]);
  if (!user)
    return (
      <Empty
        icon={Inbox}
        title="Stay in the loop"
        body="Sign in to see your notifications and shared videos."
      >
        <button className="primary" onClick={() => setAuth("login")}>
          Sign in
        </button>
      </Empty>
    );
  const list =
    tab === "activity"
      ? data?.notifications
      : data?.messages.filter((m) => m.video_id);
  const read = async () => {
    try {
      await api("/inbox/read", { all: true });
      setUnread(0);
      setOffset(0);
      load();
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <section className="content-page">
      <div className="eyebrow">YOUR COMMUNITY</div>
      <h1>
        In the loop<span>.</span>
      </h1>
      <button className="secondary" onClick={() => navigate("/chat")}>
        <Send size={18} />
        Open conversations
      </button>
      <div className="inbox-heading">
        <div className="profile-tabs">
          <button
            className={tab === "activity" ? "selected" : ""}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
          <button
            className={tab === "messages" ? "selected" : ""}
            onClick={() => setTab("messages")}
          >
            Shared with you
          </button>
        </div>
        <button className="text-button" onClick={read}>
          Mark all read
        </button>
      </div>
      {!data ? (
        <Spinner />
      ) : !list?.length ? (
        <Empty
          icon={tab === "activity" ? Heart : Send}
          title={
            tab === "activity"
              ? "Good things are on their way"
              : "Start a conversation"
          }
          body="Followers, comments, likes, and shared videos appear here."
        />
      ) : (
        <div className="notification-list">
          {list.map((n) => (
            <button
              className={`notification ${!n.read_at ? "unread" : ""}`}
              key={n.id}
              onClick={async () => {
                await api("/inbox/read", { ids: [n.id] }).catch(() => {});
                setUnread((old) => Math.max(0, old - (!n.read_at ? 1 : 0)));
                n.video_id
                  ? navigate(`/v/${n.video_id}`)
                  : navigate(`/@${n.username}`);
              }}
            >
              <Avatar person={{ ...n, user_id: n.actor_id || n.sender_id }} />
              <span>
                <strong>@{n.username}</strong>{" "}
                {tab === "activity"
                  ? descriptions[n.type]
                  : "shared a video with you"}
                <small>{timeAgo(n.created_at)}</small>
              </span>
              {!n.read_at && <i />}
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
      )}
      {data?.hasMore && (
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
function Create() {
  const { user, setAuth, config, notify, navigate } = useApp();
  const params = new URLSearchParams(location.search);
  const sourceId = params.get("source"),
    remixMode = params.get("mode");
  const [source, setSource] = useState(null);
  useEffect(() => {
    if (sourceId)
      api(`/videos/${sourceId}`)
        .then((d) => setSource(d.video))
        .catch((e) => notify(e.message));
  }, [sourceId]);
  const [jobId, setJobId] = useState(null),
    [stage, setStage] = useState("");
  const [file, setFile] = useState(null),
    [url, setUrl] = useState(""),
    [duration, setDuration] = useState(0),
    [trim, setTrim] = useState([0, 0]),
    [thumb, setThumb] = useState(0),
    [progress, setProgress] = useState(null),
    [busy, setBusy] = useState(false),
    [stream, setStream] = useState(null),
    [recording, setRecording] = useState(false),
    [error, setError] = useState("");
  const preview = useRef(),
    recorder = useRef(),
    parts = useRef([]),
    streamRef = useRef();
  const alive = useRef(true);
  streamRef.current = stream;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      recorder.current?.state === "recording" && recorder.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const object = URL.createObjectURL(file);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [file]);
  const select = (f) => {
    if (!f) return;
    if (f.size > 100 * 1024 * 1024)
      return notify("Video must be under 100 MB.");
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(f.type))
      return notify("Choose an MP4, MOV, or WebM video.");
    setFile(f);
    setError("");
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      return notify(
        "Recording is unavailable in this browser. Upload a video instead.",
      );
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      setStream(s);
      setFile(null);
      parts.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : "";
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) parts.current.push(e.data);
      };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        const type = r.mimeType.includes("mp4") ? "video/mp4" : "video/webm";
        if (alive.current) {
          select(
            new File(
              parts.current,
              [type === "video/mp4" ? "recording.mp4" : "recording.webm"],
              { type },
            ),
          );
          setRecording(false);
        }
      };
      const recordingStarted = performance.now();
      r.addEventListener(
        "stop",
        () => {
          if (alive.current) {
            const length = Math.min(
              180,
              (performance.now() - recordingStarted) / 1000,
            );
            setDuration(length);
            setTrim([0, length]);
          }
        },
        { once: true },
      );
      r.start(1000);
      setRecording(true);
      setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 180000);
    } catch (e) {
      notify(
        "Camera access was denied or unavailable. You can upload a video.",
      );
    }
  };
  useEffect(() => {
    if (stream && recording && preview.current) {
      preview.current.srcObject = stream;
      preview.current.play().catch(() => {});
    } else if (preview.current) preview.current.srcObject = null;
  }, [stream, recording, url]);
  const post = async (e) => {
    e.preventDefault();
    if (!file) return notify("Choose or record a video first.");
    if (duration > 180 || duration < 1)
      return notify("Choose a video from 1 to 180 seconds.");
    setBusy(true);
    setError("");
    setProgress(0);
    setStage("");
    setJobId(null);
    const form = new FormData(e.target);
    if (form.get("audio_busy") === "true") {
      setBusy(false);
      setProgress(null);
      return notify("Finish your voice recording before saving.");
    }
    form.delete("audio_busy");
    form.set("video", file);
    form.set("mode", e.nativeEvent.submitter?.value || "publish");
    for (const name of ["mute", "auto_captions", "allow_duet", "allow_remix"])
      form.set(name, String(form.has(name)));
    if (sourceId) {
      form.set("parent_id", sourceId);
      form.set("remix_mode", remixMode);
    }
    form.set("comments_enabled", String(form.has("comments_enabled")));
    form.set("start", String(trim[0]));
    form.set("end", String(trim[1]));
    form.set("thumbnail", String(thumb));
    try {
      const d = await uploadFile("/upload", form, setProgress);
      setJobId(d.job.id);
      if (d.job.status === "draft") {
        notify("Draft saved. You can finish it in Studio.");
        navigate("/studio");
        return;
      }
      setStage("Your video is queued for processing.");
      for (let attempt = 0; attempt < 240 && alive.current; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const result = await api(`/jobs/${d.job.id}`);
        setStage(`${result.job.status} · ${result.job.progress}%`);
        if (result.job.status === "failed") throw new Error(result.job.error);
        if (result.job.status === "completed") {
          notify(result.job.error || "Your moment is live.");
          navigate(`/v/${result.video.id}`);
          return;
        }
      }
      if (alive.current) {
        notify("Processing continues in Creator Studio.");
        navigate("/studio");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  if (!user)
    return (
      <Empty
        icon={Camera}
        title="Your moment. Your move."
        body="Join Velo to upload or record your first video."
      >
        <button className="primary" onClick={() => setAuth("signup")}>
          Create an account
        </button>
      </Empty>
    );
  return (
    <section className="content-page create-page">
      <div className="eyebrow">LET’S MAKE SOMETHING</div>
      <h1>
        Your moment<span>.</span>
      </h1>
      <p className="subheading">A new perspective starts with you.</p>
      {!user.verified && (
        <div className="verification-note">
          <Mail size={20} />
          <span>Check your email to verify your account before posting.</span>
        </div>
      )}
      {sourceId && (
        <div className="collaboration-banner">
          <h3>{remixMode === "duet" ? "Create a duet" : "Remix a moment"}</h3>
          {source && (
            <>
              <video
                src={source.video_url}
                poster={source.thumbnail_url}
                controls
                playsInline
              />
              <p>
                Original by @{source.username}.{" "}
                {remixMode === "duet"
                  ? "Your video appears beside the original."
                  : "Up to 8 seconds of the original play before your response."}
              </p>
              {source.source && (
                <p className="small-note">
                  Original footage: {source.source.author} ·{" "}
                  {source.source.license}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <form onSubmit={post} className="create-layout">
        <div>
          <div
            className={`upload-preview ${file || recording ? "has-video" : ""}`}
          >
            {url || recording ? (
              <video
                ref={preview}
                src={recording ? undefined : url}
                controls={!recording}
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const d = e.target.duration;
                  if (!Number.isFinite(d)) return;
                  setDuration(d);
                  setTrim([0, Math.min(180, d)]);
                }}
                onTimeUpdate={(e) => {
                  if (e.target.currentTime >= trim[1] && trim[1] > 0)
                    e.target.pause();
                }}
              />
            ) : (
              <label className="upload-zone">
                <div className="upload-symbol">
                  <Upload size={30} />
                </div>
                <strong>Drop into the loop</strong>
                <span>Select a video to get started</span>
                <small>
                  MP4, MOV, WebM · up to 100 MB
                  <br />
                  1–180 seconds
                </small>
                <input
                  aria-label="Select video"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => select(e.target.files[0])}
                />
              </label>
            )}
          </div>
          <div className="create-controls">
            <label className="secondary">
              <Upload size={17} />
              {file ? "Change video" : "Upload video"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                aria-label="Change video"
                disabled={busy || recording}
                onChange={(e) => select(e.target.files[0])}
              />
            </label>
            <button
              className={`secondary ${recording ? "recording" : ""}`}
              type="button"
              disabled={busy}
              onClick={record}
            >
              <Camera size={17} />
              {recording ? "Stop recording" : "Record"}
            </button>
          </div>
          {file && duration > 0 && (
            <div className="trim-controls">
              <label>
                Start <span>{trim[0].toFixed(1)}s</span>
                <input
                  aria-label="Trim start"
                  type="range"
                  min={0}
                  max={Math.max(0, trim[1] - 1)}
                  step="0.1"
                  value={trim[0]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setTrim([n, trim[1]]);
                    preview.current.currentTime = n;
                  }}
                />
              </label>
              <label>
                End <span>{trim[1].toFixed(1)}s</span>
                <input
                  aria-label="Trim end"
                  type="range"
                  min={trim[0] + 1}
                  max={Math.min(duration, 180)}
                  step="0.1"
                  value={trim[1]}
                  onChange={(e) => setTrim([trim[0], Number(e.target.value)])}
                />
              </label>
              <label>
                Cover frame <span>{thumb.toFixed(1)}s</span>
                <input
                  aria-label="Thumbnail time"
                  type="range"
                  min={0}
                  max={Math.max(0, trim[1] - trim[0] - 0.1)}
                  step="0.1"
                  value={thumb}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setThumb(t);
                    preview.current.currentTime = trim[0] + t;
                    preview.current.pause();
                  }}
                />
              </label>
            </div>
          )}
        </div>
        <div className="create-fields">
          <label>
            Caption
            <textarea
              name="caption"
              required
              maxLength={1000}
              placeholder="Tell us the story behind your moment…"
              rows={4}
            />
          </label>
          <label>
            Hashtags
            <input
              name="hashtags"
              maxLength={350}
              placeholder="#yourthing #original"
            />
          </label>
          <label>
            Category
            <select aria-label="Category" name="category" required>
              {config.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Who can watch
            <select aria-label="Who can watch" name="privacy">
              <option value="public">Everyone</option>
              <option value="followers">Followers</option>
              <option value="private">Only me</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input name="comments_enabled" type="checkbox" defaultChecked />
            Allow comments
          </label>
          <CreationTools />
          <div className="posting-note">
            Only post videos you created or have permission to share.
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {progress !== null && (
            <div className="upload-progress">
              <span>
                {stage ||
                  (progress < 100
                    ? `Uploading ${progress}%`
                    : "Saving your upload…")}
              </span>
              <div>
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {jobId && (
            <button
              type="button"
              className="secondary"
              onClick={() => navigate("/studio")}
            >
              Continue in Studio
            </button>
          )}
          <button
            className="secondary"
            name="mode"
            value="draft"
            disabled={busy || recording || !file || !user.verified}
          >
            Save draft
          </button>
          <button
            name="mode"
            value="publish"
            className="primary"
            disabled={busy || recording || !file || !user.verified}
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Plus size={18} />
                Post video
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
function Modal({ modal: m, onClose }) {
  const app = useApp();
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className={`sheet ${m.type === "comments" ? "comments-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={m.type}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <IconButton
          icon={X}
          label="Close"
          className="modal-close"
          onClick={onClose}
        />
        {m.type === "collect" ? (
          <Collect video={m.video} app={app} onClose={onClose} />
        ) : m.type === "comments" ? (
          <Comments video={m.video} patch={m.patch} />
        ) : m.type === "share" ? (
          <Share video={m.video} patch={m.patch} />
        ) : m.type === "edit" ? (
          <EditProfile
            profile={m.profile}
            onSave={m.onSave}
            onClose={onClose}
          />
        ) : m.type === "connections" ? (
          <Connections profile={m.profile} type={m.connection} />
        ) : m.type === "blocks" ? (
          <Blocked />
        ) : (
          <Options modal={m} onClose={onClose} />
        )}
      </section>
    </div>
  );
}
function Comments({ video, patch }) {
  const { user, requireUser, navigate, notify, setAuth } = useApp();
  const [items, setItems] = useState([]),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(null),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [total, setTotal] = useState(video.comments_count);
  const load = async (reset = false) => {
    try {
      const d = await api(
        `/videos/${video.id}/comments?offset=${reset ? 0 : offset}`,
      );
      setItems((old) =>
        reset
          ? d.comments
          : [
              ...old,
              ...d.comments.filter((c) => !old.some((a) => a.id === c.id)),
            ],
      );
      setMore(d.hasMore);
      setTotal(d.total);
      if (reset) setOffset(0);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [offset]);
  const refreshCount = async () => {
    const d = await api(`/videos/${video.id}`);
    patch(video.id, { comments_count: d.video.comments_count });
  };
  const post = (e) => {
    e.preventDefault();
    requireUser(async () => {
      setBusy(true);
      try {
        await api(`/videos/${video.id}/comments`, {
          body,
          parent_id: reply?.id || null,
        });
        setBody("");
        setReply(null);
        await load(true);
        await refreshCount();
      } finally {
        setBusy(false);
      }
    });
  };
  const remove = (id) =>
    requireUser(async () => {
      await api(`/comments/${id}`, {}, "DELETE");
      await load(true);
      await refreshCount();
    });
  const like = (c) =>
    requireUser(async () => {
      await api(`/comments/${c.id}/like`, { active: !c.liked });
      setItems((old) =>
        old.map((a) =>
          a.id === c.id
            ? {
                ...a,
                liked: !c.liked,
                likes_count: a.likes_count + (c.liked ? -1 : 1),
              }
            : a,
        ),
      );
    });
  const comment = (c) => (
    <div className={`comment-row ${c.parent_id ? "reply-row" : ""}`} key={c.id}>
      <Avatar
        person={c}
        size={32}
        onClick={() => navigate(`/@${c.username}`)}
      />
      <div className="comment-text">
        <button onClick={() => navigate(`/@${c.username}`)}>
          @{c.username}
        </button>
        <p>{c.body}</p>
        <div>
          <span>{timeAgo(c.created_at)}</span>
          <button onClick={() => setReply(c)}>Reply</button>
          {user?.user_id === c.user_id ? (
            <button onClick={() => remove(c.id)}>Delete</button>
          ) : (
            <button
              onClick={() => {
                const reason = prompt("Why are you reporting this comment?");
                if (reason)
                  requireUser(async () => {
                    await api("/reports", {
                      target_type: "comment",
                      target_id: c.id,
                      reason,
                    });
                    notify("Report submitted. Thank you.");
                  });
              }}
            >
              Report
            </button>
          )}
        </div>
      </div>
      <button
        className={`comment-like ${c.liked ? "liked" : ""}`}
        onClick={() => like(c)}
        aria-label="Like comment"
      >
        <Heart size={16} fill={c.liked ? "currentColor" : "none"} />
        <span>{c.likes_count}</span>
      </button>
    </div>
  );
  return (
    <>
      <h2>
        Comments <span className="muted">{total}</span>
      </h2>
      <div className="comments-list">
        {loading ? (
          <Spinner />
        ) : error ? (
          <Empty title="Unable to load comments" body={error}>
            <button className="secondary" onClick={() => load(true)}>
              Retry
            </button>
          </Empty>
        ) : !items.length ? (
          <Empty
            icon={MessageCircle}
            title="Start the conversation"
            body="Be the first to share a thought."
          />
        ) : (
          renderThreads(items, comment)
        )}
        {more && (
          <button
            className="text-button"
            onClick={() => setOffset((o) => o + 50)}
          >
            Load more comments
          </button>
        )}
      </div>
      {reply && (
        <div className="replying">
          Replying to @{reply.username}
          <button onClick={() => setReply(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <form className="comment-form" onSubmit={post}>
        <input
          aria-label="Comment"
          placeholder={
            video.comments_enabled
              ? "Add a thought…"
              : "Comments are turned off"
          }
          disabled={!video.comments_enabled || busy}
          value={body}
          maxLength={500}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          disabled={!body.trim() || busy || !video.comments_enabled}
          aria-label="Post comment"
        >
          <Send size={20} />
        </button>
      </form>
    </>
  );
}
function renderThreads(items, render) {
  const branch = (c, depth = 0) => (
    <React.Fragment key={c.id}>
      {render(c)}
      {depth < 50 &&
        items
          .filter((r) => r.parent_id === c.id)
          .map((r) => branch(r, depth + 1))}
    </React.Fragment>
  );
  return items
    .filter((c) => !c.parent_id || !items.some((p) => p.id === c.parent_id))
    .map((c) => branch(c));
}
function Share({ video, patch }) {
  const { requireUser, notify } = useApp();
  const [recipient, setRecipient] = useState("");
  const url = `${location.origin}/v/${video.id}`;
  const record = async (method, recipient) => {
    const d = await api(`/videos/${video.id}/share`, {
      method,
      ...(recipient ? { recipient } : {}),
    });
    patch(video.id, { shares_count: d.count });
  };
  const copy = () =>
    requireUser(async () => {
      await navigator.clipboard.writeText(url);
      await record("copy");
      notify("Link copied.");
    });
  const device = () =>
    requireUser(async () => {
      if (!navigator.share) {
        await navigator.clipboard.writeText(url);
        await record("copy");
        notify("Link copied.");
        return;
      }
      try {
        await navigator.share({ title: "Watch this on Velo", url });
        await record("device");
      } catch (e) {
        if (e.name !== "AbortError") throw e;
      }
    });
  return (
    <>
      <h2>Pass the good stuff on.</h2>
      <p className="subheading">A moment worth sharing.</p>
      <div className="share-buttons">
        <button onClick={copy}>
          <Link size={26} />
          <span>Copy link</span>
        </button>
        <button onClick={device}>
          <Share2 size={26} />
          <span>Share via device</span>
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          requireUser(async () => {
            await record("message", recipient);
            notify("Video sent.");
            setRecipient("");
          });
        }}
      >
        <label>
          Send to a Velo creator
          <input
            aria-label="Recipient username"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.replace(/^@/, ""))}
            placeholder="username"
            required
            pattern="[a-zA-Z0-9_]{3,24}"
          />
        </label>
        <button className="primary">
          Send video <Send size={17} />
        </button>
      </form>
      <small className="share-url">{url}</small>
    </>
  );
}
function EditProfile({ profile: p, onSave, onClose }) {
  const { setUser, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [avatar, setAvatar] = useState(null);
  return (
    <>
      <h2>Make it yours.</h2>
      <form
        className="edit-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            let d = await api(
              "/profile",
              Object.fromEntries(new FormData(e.target)),
              "PATCH",
            );
            if (avatar) {
              const form = new FormData();
              form.set("avatar", avatar);
              d = await uploadFile("/profile/avatar", form);
            }
            setUser(d.user);
            onSave(d.user);
            onClose();
            notify("Profile updated.");
            history.replaceState({}, "", `/@${d.user.username}`);
            dispatchEvent(new PopStateEvent("popstate"));
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="avatar-upload">
          <Avatar person={p} size={60} />
          <span>Change photo</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Profile photo"
            onChange={(e) => setAvatar(e.target.files[0])}
          />
          {avatar && <small>{avatar.name}</small>}
        </label>
        <label>
          Display name
          <input
            name="display_name"
            defaultValue={p.display_name}
            maxLength={50}
            required
          />
        </label>
        <label>
          Username
          <input
            name="username"
            defaultValue={p.username}
            pattern="[a-zA-Z0-9_]{3,24}"
            required
          />
        </label>
        <label>
          Bio
          <textarea name="bio" defaultValue={p.bio} rows={3} maxLength={160} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? <Spinner /> : "Save profile"}
        </button>
      </form>
    </>
  );
}
function Connections({ profile: p, type }) {
  const { navigate, notify } = useApp();
  const [items, setItems] = useState([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  useEffect(() => {
    api(`/profiles/${p.username}/connections?type=${type}&offset=${offset}`)
      .then((d) => {
        setItems((old) => [...old, ...d.profiles]);
        setMore(d.hasMore);
      })
      .catch((e) => notify(e.message));
  }, [offset]);
  return (
    <>
      <h2>{type === "followers" ? "Followers" : "Following"}</h2>
      <div className="connection-list">
        {items.map((a) => (
          <button
            className="creator-tile"
            key={a.user_id}
            onClick={() => navigate(`/@${a.username}`)}
          >
            <Avatar person={a} />
            <span>
              <strong>{a.display_name}</strong>
              <small>@{a.username}</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        ))}
        {!items.length && (
          <Empty
            icon={Users}
            title="Connections start here"
            body="Explore the feed and follow your favorites."
          />
        )}
        {more && (
          <button
            className="secondary"
            onClick={() => setOffset((o) => o + 50)}
          >
            Load more
          </button>
        )}
      </div>
    </>
  );
}
function Blocked() {
  const { run, notify } = useApp();
  const [items, setItems] = useState([]);
  useEffect(() => {
    api("/blocks")
      .then((d) => setItems(d.profiles))
      .catch((e) => notify(e.message));
  }, []);
  return (
    <>
      <h2>Blocked accounts</h2>
      {items.map((p) => (
        <div className="blocked-row" key={p.user_id}>
          <span>@{p.username}</span>
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await api("/blocks", { user_id: p.user_id, active: false });
                setItems((v) => v.filter((a) => a.user_id !== p.user_id));
              })
            }
          >
            Unblock
          </button>
        </div>
      ))}
      {!items.length && (
        <p className="subheading">You haven’t blocked anyone.</p>
      )}
    </>
  );
}
function Options({ modal: m, onClose }) {
  const app = useApp();
  const { user, navigate, requireUser, notify } = useApp();
  const v = m.video,
    p = m.profile;
  const report = (type) => {
    const reason = prompt(`Why are you reporting this ${type}?`);
    if (reason)
      requireUser(async () => {
        await api("/reports", {
          target_type: type,
          target_id: type === "video" ? v.id : p.user_id,
          reason,
        });
        notify("Report submitted for review.");
        onClose();
      });
  };
  const block = (id) =>
    requireUser(async () => {
      await api("/blocks", { user_id: id, active: true });
      notify("Account blocked.");
      navigate("/");
      location.reload();
    });
  return (
    <>
      <h2>{v ? "Video options" : "Creator options"}</h2>
      {v && <VideoExtras app={app} video={v} onClose={onClose} />}
      <div className="options-list">
        <button onClick={() => report(v ? "video" : "user")}>
          <Flag size={20} />
          Report {v ? "video" : "creator"}
        </button>
        {(v?.user_id || p?.user_id) !== user?.user_id && (
          <button onClick={() => block(v?.user_id || p.user_id)}>
            <ShieldOff size={20} />
            Block creator
          </button>
        )}
        {v?.user_id === user?.user_id && (
          <button
            className="danger"
            onClick={() => {
              if (confirm("Delete this video? This cannot be undone."))
                requireUser(async () => {
                  await api(`/videos/${v.id}`, {}, "DELETE");
                  notify("Video deleted.");
                  navigate("/");
                });
            }}
          >
            <Trash2 size={20} />
            Delete video
          </button>
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
