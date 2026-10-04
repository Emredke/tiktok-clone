import {
  WorldArt,
  FirstAdventure,
  ChallengeTeaser,
  useClub,
  clubRefresh,
} from "./club.jsx";
import React, { useState, useEffect } from "react";
import {
  Compass,
  ArrowUpRight,
  ArrowRight,
  Search,
  Play,
  Flag,
  Camera,
  Layers,
  Check,
  Award,
  RefreshCw,
} from "lucide-react";
import { api } from "./api";

const questIcons = { compass: Compass, collection: Layers, camera: Camera };
function useQuests(user) {
  const [state, setState] = useState(null),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => setState(null), [user?.user_id]);
  useEffect(() => {
    let alive = true;
    setError("");
    api("/quests")
      .then((d) => {
        if (alive) setState(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.user_id, revision]);
  useEffect(() => {
    window.addEventListener("velo-quests", refresh);
    return () => window.removeEventListener("velo-quests", refresh);
  }, []);
  return { state, setState, error, refresh };
}

export function Passport({ app, compact = false }) {
  const { state, error, refresh } = useQuests(app.user);
  const { state: club } = useClub(app.user);
  return (
    <section
      className={`passport passport-cover-${club?.style.cover || "paper"} ${compact ? "compact-passport" : ""}`}
    >
      <div className="passport-top">
        <span className="eyebrow">YOUR CREATIVE PASSPORT</span>
        <Compass size={22} />
      </div>
      {app.user ? (
        error ? (
          <>
            <p>{error}</p>
            <button className="secondary" onClick={refresh}>
              Try again
            </button>
          </>
        ) : state ? (
          <>
            <div className="passport-level">
              <span>{String(state.level).padStart(2, "0")}</span>
              <div>
                <strong>{state.rank}</strong>
                <small>
                  Level {state.level} · {state.xp} lifetime XP
                </small>
              </div>
            </div>
            <div
              className="xp-meter"
              role="progressbar"
              aria-label="Progress to next level"
              aria-valuenow={state.levelXp}
              aria-valuemin={0}
              aria-valuemax={state.nextLevelXp}
            >
              <i
                style={{
                  width: `${(state.levelXp / state.nextLevelXp) * 100}%`,
                }}
              />
            </div>
            <div className="passport-detail">
              <span>
                {state.levelXp} / {state.nextLevelXp} XP to level{" "}
                {state.level + 1}
              </span>
              <span>
                {state.badges.length}{" "}
                {state.badges.length === 1 ? "stamp" : "stamps"}
              </span>
            </div>
            <button
              onClick={() => app.navigate("/passport")}
              className="passport-customize"
            >
              Make it yours <ArrowUpRight size={17} />
            </button>
            <button onClick={() => app.navigate("/quests")}>
              Visit your quest board <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <p role="status">Opening your passport…</p>
        )
      ) : (
        <>
          <h2>
            A little curiosity.
            <br />A new adventure.
          </h2>
          <p>
            Collect stamps for exploring, curating, and making something of your
            own.
          </p>
          <button onClick={() => app.setAuth("signup")}>
            Start your passport <ArrowRight size={17} />
          </button>
        </>
      )}
    </section>
  );
}

function DiscoveryCard({ video, app, featured = false, index = 0 }) {
  return (
    <button
      className={featured ? "featured-film" : "discovery-card"}
      onClick={() => app.navigate(`/v/${video.id}`)}
      aria-label={`Watch ${video.caption.split("#")[0].trim()}`}
    >
      <div className="discovery-image">
        <img
          src={video.thumbnail_url}
          alt=""
          loading={featured ? "eager" : "lazy"}
        />
        <span className="film-play">
          <Play size={featured ? 25 : 18} fill="currentColor" />
        </span>
        <span className="film-duration">{Math.ceil(video.duration)}s</span>
      </div>
      <div className="discovery-copy">
        <span className="eyebrow">
          {featured
            ? "THE SPOTLIGHT"
            : `${String(index + 1).padStart(2, "0")} / ${video.category.toUpperCase()}`}
        </span>
        <h3>{video.caption.split("#")[0].trim()}</h3>
        <div>
          <span>
            {video.source
              ? `Footage by ${video.source.author}`
              : `@${video.username}`}
          </span>
          <ArrowUpRight size={18} />
        </div>
      </div>
    </button>
  );
}

export function Explore({ app }) {
  const { state: club } = useClub(app.user);
  const [mode, setMode] = useState("foryou"),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState("");
  useEffect(() => {
    let alive = true;
    setItems([]);
    setLoading(true);
    setError("");
    api(`/feed?mode=${mode}`)
      .then((d) => {
        if (alive) {
          setItems(d.videos);
          setMore(d.hasMore);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, app.user?.user_id, revision]);
  const loadMore = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api(
        `/feed?mode=${mode}&exclude=${items.map((v) => v.id).join(",")}`,
      );
      setItems((old) => [
        ...old,
        ...d.videos.filter((v) => !old.some((x) => x.id === v.id)),
      ]);
      setMore(d.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const trails = [
    {
      name: "Animals",
      title: "The wild side",
      detail: "Little lives. Big surprises.",
      color: "sage",
      symbol: "01",
    },
    {
      name: "Travel",
      title: "Somewhere else",
      detail: "A window to another world.",
      color: "blue",
      symbol: "02",
    },
    {
      name: "Education",
      title: "Wait, how?",
      detail: "A small dose of discovery.",
      color: "yellow",
      symbol: "03",
    },
  ];
  return (
    <section className="explore-page">
      <header className="explore-topbar">
        <span className="field-wordmark">
          <Compass size={23} /> velo <small>THE CURIOSITY CLUB</small>
        </span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            app.navigate(`/discover?q=${encodeURIComponent(search)}`);
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search the club"
            placeholder="Find something good"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button aria-label="Search videos">
            <ArrowRight size={18} />
          </button>
        </form>
      </header>
      <div className="world-hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <i /> A HOME FOR THE CURIOUS
          </span>
          <h1>
            A world worth
            <br />
            getting <em>lost in.</em>
          </h1>
          <p>
            Little films. Big feelings. Follow your curiosity somewhere
            unexpected.
          </p>
          <div className="hero-actions">
            <button
              className="light-button"
              onClick={() => app.navigate("/discover")}
            >
              Find your next wonder <ArrowUpRight size={18} />
            </button>
            <button
              className="hero-text-link"
              onClick={() => app.navigate("/challenges")}
            >
              Make something together <ArrowRight size={17} />
            </button>
          </div>
          <div className="hero-caption">
            <span>✦</span>
            <span>
              {club
                ? `${club.films} credited real films`
                : "Fresh perspectives"}{" "}
              · A whole world to discover
            </span>
          </div>
        </div>
        <WorldArt />
      </div>
      <FirstAdventure
        app={app}
        club={club}
        onFilm={() =>
          items[0]
            ? app.navigate(`/v/${items[0].id}`)
            : app.navigate("/discover")
        }
      />
      <div className="home-companion">
        <ChallengeTeaser app={app} challenge={club?.challenge} />
        <Passport app={app} compact />
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">CHOOSE YOUR DIRECTION</span>
          <h2>Out of the ordinary.</h2>
        </div>
        <button onClick={() => app.navigate("/discover")}>
          All topics <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="topic-trails">
        {trails.map((t) => (
          <button
            key={t.name}
            className={`topic-trail ${t.color}`}
            onClick={() => app.navigate(`/discover?q=${t.name}`)}
          >
            <span className="trail-number">{t.symbol}</span>
            <div>
              <strong>{t.title}</strong>
              <small>{t.detail}</small>
            </div>
            <ArrowUpRight size={22} />
          </button>
        ))}
      </div>
      <div className="section-heading selection-heading">
        <div>
          <span className="eyebrow">THE SCREENING SHELF</span>
          <h2>A few things to get lost in.</h2>
        </div>
        <div className="shelf-switch" aria-label="Video selection">
          <button
            className={mode === "foryou" ? "selected" : ""}
            aria-pressed={mode === "foryou"}
            onClick={() => setMode("foryou")}
          >
            Club picks
          </button>
          <button
            className={mode === "following" ? "selected" : ""}
            aria-pressed={mode === "following"}
            onClick={() => setMode("following")}
          >
            Your circle
          </button>
        </div>
      </div>
      {error && (
        <div className="explore-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      )}
      {loading && !items.length && (
        <p role="status" className="shelf-loading">
          Putting together your shelf…
        </p>
      )}
      {!loading && !error && !items.length && (
        <div className="shelf-empty">
          <Compass size={30} />
          <h3>Your next discovery is waiting.</h3>
          <p>
            {mode === "following"
              ? "Follow a creator to see their films in Your circle."
              : "New films will appear here when they’re ready."}
          </p>
          <button className="primary" onClick={() => app.navigate("/discover")}>
            Find a creator <ArrowRight size={16} />
          </button>
        </div>
      )}
      {!!items.length && (
        <>
          <div className="spotlight-row">
            <DiscoveryCard video={items[0]} app={app} featured />
            <aside className="make-card">
              <span className="eyebrow">FROM WATCHING TO MAKING</span>
              <div className="make-symbol">
                <Camera size={46} />
                <span>✦</span>
              </div>
              <h2>
                Your perspective
                <br />
                belongs here.
              </h2>
              <p>A tiny story, a curious detail, a moment only you noticed.</p>
              <button
                className="primary"
                onClick={() => app.navigate("/create")}
              >
                Make a film <ArrowUpRight size={17} />
              </button>
              <button
                className="make-quest-link"
                onClick={() => app.navigate("/quests")}
              >
                <Flag size={15} /> See this week’s quests
              </button>
            </aside>
          </div>
          <div className="discovery-grid">
            {items.slice(1).map((v, i) => (
              <DiscoveryCard key={v.id} video={v} app={app} index={i} />
            ))}
          </div>
        </>
      )}
      {more && (
        <button
          className="shelf-more secondary"
          disabled={loading}
          onClick={loadMore}
        >
          {loading ? "Finding more…" : "Open another shelf"}
          <ArrowRight size={16} />
        </button>
      )}
      <footer className="field-footer">
        <Compass size={17} />
        <span>A club for curious people. Go at your own pace.</span>
        <button onClick={() => app.navigate("/beta")}>
          Leave a field note <ArrowUpRight size={16} />
        </button>
        <button onClick={() => app.navigate("/quests")}>
          The quest board <ArrowUpRight size={16} />
        </button>
      </footer>
    </section>
  );
}

export function Quests({ app }) {
  const { state, setState, error, refresh } = useQuests(app.user);
  const [busy, setBusy] = useState("");
  const claim = (id) =>
    app.requireUser(async () => {
      if (busy) return;
      setBusy(id);
      try {
        const d = await api(`/quests/${id}/claim`, {});
        setState(d.state);
        clubRefresh();
        app.notify(
          d.awarded
            ? `+${d.awarded} XP added to your passport.`
            : "This reward is already in your passport.",
        );
      } finally {
        setBusy("");
      }
    });
  return (
    <section className="explore-page quest-page">
      <header className="quest-heading">
        <span className="eyebrow">A LITTLE PURPOSE. A LITTLE PLAY.</span>
        <h1>
          The quest <em>board.</em>
        </h1>
        <p>Small creative adventures. Your progress, at your pace.</p>
      </header>
      <div className="quest-layout">
        <div>
          <div className="quest-season">
            <Flag size={20} />
            <div>
              <strong>This week’s adventures</strong>
              <span>
                {state
                  ? `New quests ${new Date(state.ends).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} · Monday reset at 00:00 UTC`
                  : "Three ways to follow your curiosity"}
              </span>
            </div>
          </div>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {!state && !error && <p role="status">Opening the quest board…</p>}
          {state?.quests.map((q, i) => {
            const Icon = questIcons[q.icon];
            return (
              <article
                className={`quest-card ${q.claimed ? "quest-claimed" : ""}`}
                key={q.id}
              >
                <div className="quest-symbol">
                  <Icon size={28} />
                  <span>0{i + 1}</span>
                </div>
                <div className="quest-content">
                  <div className="quest-card-top">
                    <span className="eyebrow">
                      {q.badge.toUpperCase()} STAMP
                    </span>
                    <span className="xp-tag">+{q.xp} XP</span>
                  </div>
                  <h2>{q.title}</h2>
                  <p>{q.description}</p>
                  <div className="quest-progress">
                    <div
                      className="xp-meter"
                      role="progressbar"
                      aria-label={`${q.title} progress`}
                      aria-valuenow={q.claimed ? q.goal : q.progress}
                      aria-valuemin={0}
                      aria-valuemax={q.goal}
                    >
                      <i
                        style={{
                          width: `${((q.claimed ? q.goal : q.progress) / q.goal) * 100}%`,
                        }}
                      />
                    </div>
                    <span>
                      {q.claimed ? q.goal : q.progress}/{q.goal}
                    </span>
                  </div>
                  <div className="quest-card-bottom">
                    <span>
                      {q.claimed ? (
                        <>
                          <Check size={16} /> Reward collected
                        </>
                      ) : (
                        "One reward per quest each week"
                      )}
                    </span>
                    {q.claimed ? (
                      <span className="stamp-earned">Stamp earned</span>
                    ) : q.completed && app.user ? (
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => claim(q.id)}
                      >
                        {busy === q.id ? "Collecting…" : `Collect ${q.xp} XP`}
                      </button>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() =>
                          q.path === "/library" && !app.user
                            ? app.setAuth("signup")
                            : app.navigate(q.path)
                        }
                      >
                        {q.action}
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <aside>
          <Passport app={app} />
          <section className="stamp-book">
            <span className="eyebrow">YOUR STAMP BOOK</span>
            <h2>Proof of possibility.</h2>
            <div className="stamp-grid">
              {[
                ...(state?.quests || []),
                {
                  id: "first-adventure",
                  badge: "First light",
                  icon: "compass",
                },
                { id: "challenge", badge: "Trail maker", icon: "camera" },
              ].map((q) => {
                const earned = state?.badges.some((b) => b.id === q.id);
                const Icon = questIcons[q.icon];
                return (
                  <div
                    className={`passport-stamp ${earned ? "earned" : ""}`}
                    key={q.id}
                  >
                    <Icon size={27} />
                    <strong>{q.badge}</strong>
                    <small>{earned ? "Earned" : "Not yet earned"}</small>
                  </div>
                );
              })}
            </div>
            <p>
              Your stamps and XP are private. No leaderboards, lost streaks, or
              rewards for watch time. XP is for fun and has no cash value.
            </p>
          </section>
        </aside>
      </div>
      <div className="quest-note">
        <Award size={23} />
        <p>
          Keep the stamps you earn. New quests arrive each week, but taking a
          break never takes your progress away. Verify your email to collect
          rewards.
        </p>
      </div>
    </section>
  );
}
