import React, { useState, useEffect } from "react";
import { api } from "./api";
import {
  BarChart3,
  Clapperboard,
  ShieldCheck,
  SlidersHorizontal,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Trash2,
  Plus,
  X,
} from "lucide-react";
export function CreationTools({ defaults = {}, prefix = "" }) {
  return (
    <div className="editing-tools">
      <h3>Make it yours</h3>
      <div className="tool-grid">
        <label>
          Playback speed
          <select name="speed" defaultValue={defaults.speed || 1}>
            <option value="0.5">0.5× slow motion</option>
            <option value="1">1× original</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label>
          Rotate
          <select name="rotation" defaultValue={defaults.rotation || 0}>
            {[0, 90, 180, 270].map((n) => (
              <option key={n} value={n}>
                {n}°
              </option>
            ))}
          </select>
        </label>
        <label>
          Framing
          <select name="fit" defaultValue={defaults.fit || "contain"}>
            <option value="contain">Fit whole video</option>
            <option value="cover">Fill vertical frame</option>
          </select>
        </label>
        <label>
          Text position
          <select
            name="overlay_position"
            defaultValue={defaults.overlay_position || "bottom"}
          >
            <option value="bottom">Lower third</option>
            <option value="top">Top</option>
          </select>
        </label>
      </div>
      <label>
        Text overlay
        <textarea
          name="overlay"
          maxLength={180}
          rows={2}
          placeholder="A few words that stay on screen"
          defaultValue={defaults.overlay || ""}
        />
      </label>
      <div className="tool-grid">
        <label>
          Text starts at (seconds)
          <input
            name="overlay_start"
            type="number"
            min="0"
            max="180"
            step=".1"
            defaultValue={defaults.overlay_start || 0}
          />
        </label>
        <label>
          Text ends at (seconds)
          <input
            name="overlay_end"
            type="number"
            min=".1"
            max="180"
            step=".1"
            defaultValue={defaults.overlay_end ?? 180}
          />
        </label>
      </div>
      {[
        ["mute", "Remove original audio", false],
        ["auto_captions", "Generate speech captions", true],
        ["allow_duet", "Allow duets", true],
        ["allow_remix", "Allow remixes", true],
      ].map(([name, label, d]) => (
        <label className="checkbox-label" key={name}>
          <input
            type="checkbox"
            name={name}
            defaultChecked={defaults[name] ?? d}
          />
          {label}
        </label>
      ))}
      <p className="small-note">
        Edits are rendered when you publish. Automatic captions use a local
        speech model; you can review and edit them in Studio.
      </p>
    </div>
  );
}
export function formOptions(form) {
  const values = Object.fromEntries(form.entries());
  for (const key of [
    "comments_enabled",
    "mute",
    "auto_captions",
    "allow_duet",
    "allow_remix",
  ])
    values[key] = form.has(key);
  for (const key of [
    "start",
    "end",
    "thumbnail",
    "speed",
    "rotation",
    "overlay_start",
    "overlay_end",
  ])
    if (values[key] !== undefined) values[key] = Number(values[key]);
  delete values.video;
  return values;
}
export function Interests({ app, onDone, onboarding = false }) {
  const { config, user, setUser, notify } = app;
  const [chosen, setChosen] = useState([]),
    [hidden, setHidden] = useState([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/preferences")
      .then((d) => {
        setChosen(d.interests);
        setHidden(d.hidden);
      })
      .catch((e) => notify(e.message));
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      const d = await api("/preferences", { interests: chosen }, "PUT");
      setUser(d.user);
      notify("Your feed preferences are saved.");
      onDone?.();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="interests-panel">
      <div className="eyebrow">YOUR WORLD, YOUR WAY</div>
      <h2>{onboarding ? "What are you into?" : "Tune your feed"}</h2>
      <p>
        Choose topics you love. Your viewing and feedback will keep shaping For
        You.
      </p>
      <div className="interest-grid">
        {config.categories.map((c) => (
          <button
            type="button"
            key={c}
            aria-pressed={chosen.includes(c)}
            className={chosen.includes(c) ? "selected" : ""}
            onClick={() =>
              setChosen((a) =>
                a.includes(c) ? a.filter((x) => x !== c) : [...a, c],
              )
            }
          >
            {c}
            {chosen.includes(c) && <Check size={16} />}
          </button>
        ))}
      </div>
      <button className="primary" disabled={busy} onClick={save}>
        {busy ? "Saving…" : onboarding ? "Start exploring" : "Save interests"}
      </button>
      {onboarding && (
        <button
          className="text-button"
          onClick={async () => {
            const d = await api("/preferences", { interests: [] }, "PUT");
            setUser(d.user);
            onDone?.();
          }}
        >
          Explore everything
        </button>
      )}
      {!onboarding && (
        <>
          <h3>Hidden from For You</h3>
          <p className="small-note">
            You can bring a video, creator, or category back at any time.
          </p>
          {hidden.map((h) => (
            <div className="studio-row" key={h.kind + h.target}>
              <span>
                {h.kind}: {h.label || "No longer available"}
              </span>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api("/feedback", {
                      kind: h.kind,
                      target: h.target,
                      active: false,
                    });
                    setHidden((a) => a.filter((x) => x !== h));
                    notify("Restored to your feed.");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                Undo
              </button>
            </div>
          ))}
          {!hidden.length && <p>No hidden videos or topics yet.</p>}
        </>
      )}
    </div>
  );
}
export function VideoExtras({ app, video: v, onClose }) {
  const { user, requireUser, navigate, notify } = app;
  const [duet, setDuet] = useState(Boolean(v.allow_duet)),
    [remix, setRemix] = useState(Boolean(v.allow_remix));
  const feedback = (kind, target) =>
    requireUser(async () => {
      await api("/feedback", { kind, target, active: true });
      notify("Your For You feed has been updated.");
      onClose();
      navigate("/?feed=" + Date.now());
    });
  return (
    <div className="video-extras">
      <div className="recommendation-note">
        <strong>Why this video?</strong>
        <p>
          {v.reason ||
            "This is a direct video view. Personalized explanations appear with recommendations in For You."}
        </p>
        <small>
          Ranking also considers freshness, viewing history, follows, and
          engagement. Change your interests in Feed preferences.
        </small>
      </div>
      {v.source && (
        <div className="source-credit">
          <strong>Original footage by {v.source.author}</strong>
          <p>
            <a href={v.source.page} target="_blank" rel="noreferrer">
              Original video on Wikimedia Commons <ArrowUpRight size={13} />
            </a>{" "}
            ·{" "}
            <a href={v.source.license_url} target="_blank" rel="noreferrer">
              {v.source.license}
            </a>
          </p>
          <small>{v.source.changes}</small>
        </div>
      )}
      {v.parent && (
        <button
          className="secondary"
          onClick={() => navigate(`/v/${v.parent.id}`)}
        >
          Watch the original video
        </button>
      )}
      <div className="options-list">
        {v.privacy === "public" && Boolean(v.allow_duet) && (
          <button
            onClick={() =>
              requireUser(async () =>
                navigate(`/create?source=${v.id}&mode=duet`),
              )
            }
          >
            <Clapperboard size={20} />
            Create a duet
          </button>
        )}
        {v.privacy === "public" && Boolean(v.allow_remix) && (
          <button
            onClick={() =>
              requireUser(async () =>
                navigate(`/create?source=${v.id}&mode=remix`),
              )
            }
          >
            <Plus size={20} />
            Remix this video
          </button>
        )}
        <button onClick={() => feedback("video", v.id)}>
          Not interested in this video
        </button>
        <button onClick={() => feedback("category", v.category)}>
          See less {v.category}
        </button>
        <button onClick={() => feedback("creator", v.user_id)}>
          Hide this creator from For You
        </button>
      </div>
      {v.user_id === user?.user_id && (
        <div className="collaboration-settings">
          <h3>Collaboration permissions</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={duet}
              onChange={(e) => setDuet(e.target.checked)}
            />
            Allow duets
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={remix}
              onChange={(e) => setRemix(e.target.checked)}
            />
            Allow remixes
          </label>
          <button
            className="secondary"
            onClick={() =>
              requireUser(async () => {
                await api(
                  `/videos/${v.id}/settings`,
                  { allow_duet: duet, allow_remix: remix },
                  "PATCH",
                );
                notify("Permissions saved.");
                onClose();
              })
            }
          >
            Save permissions
          </button>
        </div>
      )}
    </div>
  );
}
function CaptionsEditor({ video, notify, onSaved }) {
  const [cues, setCues] = useState(JSON.parse(video.captions_json || "[]")),
    [busy, setBusy] = useState(false);
  const change = (i, k, v) =>
    setCues((a) => a.map((c, j) => (i === j ? { ...c, [k]: v } : c)));
  return (
    <div className="caption-editor">
      <h3>Review captions</h3>
      <p className="small-note">
        {video.captions_status === "no_speech"
          ? "No speech was detected."
          : video.captions_status === "failed"
            ? "Automatic captions need attention. You can enter them here."
            : "Adjust the words and timing before sharing."}
      </p>
      {cues.map((c, i) => (
        <div className="cue-row" key={i}>
          <label>
            Start
            <input
              type="number"
              min="0"
              step=".1"
              aria-label={`Caption ${i + 1} start`}
              value={c.start}
              onChange={(e) => change(i, "start", Number(e.target.value))}
            />
          </label>
          <label>
            End
            <input
              type="number"
              min="0"
              max={video.duration}
              step=".1"
              aria-label={`Caption ${i + 1} end`}
              value={c.end}
              onChange={(e) => change(i, "end", Number(e.target.value))}
            />
          </label>
          <label>
            Words
            <input
              value={c.text}
              maxLength={300}
              aria-label={`Caption ${i + 1} text`}
              onChange={(e) => change(i, "text", e.target.value)}
            />
          </label>
          <button
            className="icon-button"
            aria-label={`Remove caption ${i + 1}`}
            onClick={() => setCues((a) => a.filter((_, j) => i !== j))}
          >
            <X size={17} />
          </button>
        </div>
      ))}
      <div className="studio-actions">
        <button
          className="secondary"
          onClick={() =>
            setCues((a) => [
              ...a,
              {
                start: a.at(-1)?.end || 0,
                end: Math.min(video.duration, (a.at(-1)?.end || 0) + 2),
                text: "",
              },
            ])
          }
        >
          Add caption
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/videos/${video.id}/captions`, { cues }, "PATCH");
              notify("Captions saved.");
              onSaved();
            } catch (e) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save captions
        </button>
      </div>
    </div>
  );
}
function DraftEditor({ job, app, onDone }) {
  const o = job.options;
  const save = async (e) => {
    e.preventDefault();
    const options = formOptions(new FormData(e.currentTarget));
    options.mode = e.nativeEvent.submitter?.value || "draft";
    try {
      await api(`/jobs/${job.id}`, { ...o, ...options }, "PATCH");
      app.notify(
        options.mode === "publish" ? "Your video is queued." : "Draft saved.",
      );
      onDone();
    } catch (e) {
      app.notify(e.message);
    }
  };
  return (
    <form className="draft-editor" onSubmit={save}>
      <div className="studio-row">
        <h2>Finish your draft</h2>
        <button type="button" className="secondary" onClick={onDone}>
          Close draft
        </button>
      </div>
      <video src={`/api/jobs/${job.id}/raw`} controls playsInline />
      <label>
        Caption
        <textarea
          name="caption"
          aria-label="Caption"
          required
          maxLength={1000}
          defaultValue={o.caption}
        />
      </label>
      <div className="tool-grid">
        <label>
          Category
          <select name="category" defaultValue={o.category}>
            {app.config.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Who can watch
          <select name="privacy" defaultValue={o.privacy}>
            <option value="public">Everyone</option>
            <option value="followers">Followers</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <label>
          Trim start
          <input
            name="start"
            type="number"
            min="0"
            max="179"
            step=".1"
            defaultValue={o.start}
          />
        </label>
        <label>
          Trim end
          <input
            name="end"
            type="number"
            min="1"
            max="180"
            step=".1"
            defaultValue={o.end || 180}
          />
        </label>
        <label>
          Cover frame
          <input
            name="thumbnail"
            type="number"
            min="0"
            max="180"
            step=".1"
            defaultValue={o.thumbnail}
          />
        </label>
        <label>
          Hashtags
          <input name="hashtags" maxLength={350} defaultValue={o.hashtags} />
        </label>
      </div>
      <label className="checkbox-label">
        <input
          name="comments_enabled"
          type="checkbox"
          defaultChecked={o.comments_enabled}
        />
        Allow comments
      </label>
      <CreationTools defaults={o} />
      <div className="studio-actions">
        <button className="secondary" name="mode" value="draft">
          Save changes
        </button>
        <button className="primary" name="mode" value="publish">
          Publish draft
        </button>
      </div>
    </form>
  );
}
export function Studio({ app }) {
  const [days, setDays] = useState(30),
    [data, setData] = useState(null),
    [jobs, setJobs] = useState([]),
    [tab, setTab] = useState("analytics"),
    [draft, setDraft] = useState(null),
    [editing, setEditing] = useState(null),
    [loading, setLoading] = useState(true);
  const refresh = () =>
    Promise.all([
      api(`/studio/analytics?days=${days}`).then(setData),
      api("/jobs").then((d) => setJobs(d.jobs)),
    ])
      .catch((e) => app.notify(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    if (!app.user) return;
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [days, app.user?.user_id]);
  useEffect(() => {
    if (
      jobs.some((j) =>
        ["draft", "queued", "processing", "failed"].includes(j.status),
      )
    )
      setTab("uploads");
  }, [jobs.length]);
  if (!app.user)
    return (
      <section className="content-page">
        <h1>Creator Studio</h1>
        <p>Sign in to manage your videos.</p>
        <button className="primary" onClick={() => app.setAuth("login")}>
          Sign in
        </button>
      </section>
    );
  if (draft)
    return (
      <section className="content-page studio-page">
        <DraftEditor
          key={draft.id}
          job={draft}
          app={app}
          onDone={() => {
            setDraft(null);
            refresh();
          }}
        />
      </section>
    );
  if (editing)
    return (
      <section className="content-page studio-page">
        <button className="secondary" onClick={() => setEditing(null)}>
          Back to Studio
        </button>
        <video
          className="studio-preview"
          src={editing.video_url}
          controls
          playsInline
        />
        <CaptionsEditor
          key={editing.id}
          video={editing}
          notify={app.notify}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      </section>
    );
  const t = data?.totals || {},
    max = Math.max(1, ...(data?.daily || []).map((x) => x.views));
  return (
    <section className="content-page studio-page">
      <div className="eyebrow">YOUR NEXT CHAPTER</div>
      <div className="studio-row">
        <h1>
          Creator Studio<span>.</span>
        </h1>
        <button className="primary" onClick={() => app.navigate("/create")}>
          Create video
        </button>
      </div>
      <p className="subheading">
        Your moments, their impact, and what comes next.
      </p>
      <div className="tabs">
        <button
          className={tab === "analytics" ? "active" : ""}
          onClick={() => setTab("analytics")}
        >
          Analytics
        </button>
        <button
          className={tab === "uploads" ? "active" : ""}
          onClick={() => setTab("uploads")}
        >
          Uploads & drafts{" "}
          <small>{jobs.filter((j) => j.status === "draft").length}</small>
        </button>
      </div>
      {loading ? (
        <p>Loading your Studio…</p>
      ) : tab === "analytics" ? (
        <>
          <div className="studio-row">
            <h2>Your audience</h2>
            <select
              aria-label="Analytics period"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </div>
          <div className="metric-grid">
            {[
              ["Views", t.views || 0],
              ["Watch time", `${Math.round((t.watch_seconds || 0) / 60)} min`],
              ["Average watch", `${(t.average_watch || 0).toFixed(1)}s`],
              [
                "Completed views",
                `${Math.round((t.completion_rate || 0) * 100)}%`,
              ],
              ["New followers", t.new_followers || 0],
              ["Net follower growth", t.net_followers || 0],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="analytics-chart">
            <h3>Views over time</h3>
            {data?.daily.length ? (
              <div className="chart-bars">
                {data.daily.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.views} views`}>
                    <span>{d.views}</span>
                    <i
                      style={{
                        height: `${Math.max(4, (d.views / max) * 130)}px`,
                      }}
                    />
                    <small>{d.date.slice(5)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                Your first views will appear here. Counts come from actual
                playback events.
              </p>
            )}
          </div>
          <h2>Your videos</h2>
          {!data?.videos.length && (
            <p>No published videos yet. Start with a draft.</p>
          )}
          {data?.videos.map((v) => (
            <div className="studio-video" key={v.id}>
              <button
                className="studio-video-title"
                onClick={() => app.navigate(`/v/${v.id}`)}
              >
                {v.caption}
                <small>{v.status}</small>
              </button>
              <span>
                {v.views} views · {Math.round(v.completion_rate * 100)}%
                completed · {v.average_watch.toFixed(1)}s avg · {v.likes} likes
                · {v.shares} shares
              </span>
              {v.status === "ready" && (
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      const d = await api(`/videos/${v.id}`);
                      setEditing(d.video);
                    } catch (e) {
                      app.notify(e.message);
                    }
                  }}
                >
                  Edit captions
                </button>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          <h2>Keep creating</h2>
          <p className="small-note">
            Uploads continue processing in the background. Drafts stay private
            until you publish them.
          </p>
          {!jobs.length && <p>You have no uploads yet.</p>}
          {jobs.map((j) => (
            <div className="job-card" key={j.id}>
              <div className="studio-row">
                <strong>{j.options.caption}</strong>
                <span className={`status-pill ${j.status}`}>{j.status}</span>
              </div>
              {["queued", "processing"].includes(j.status) && (
                <>
                  <progress value={j.progress} max="100" />
                  <p>{j.progress}% · you can leave this page</p>
                </>
              )}
              {j.error && <p className="job-warning">{j.error}</p>}
              <div className="studio-actions">
                {["draft", "failed"].includes(j.status) && (
                  <button className="secondary" onClick={() => setDraft(j)}>
                    {j.status === "failed" ? "Edit & retry" : "Continue draft"}
                  </button>
                )}
                {j.status === "completed" && (
                  <>
                    <button
                      className="primary"
                      onClick={() => app.navigate(`/v/${j.video_id}`)}
                    >
                      Watch video
                    </button>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          setEditing(
                            (await api(`/videos/${j.video_id}`)).video,
                          );
                        } catch (e) {
                          app.notify(e.message);
                        }
                      }}
                    >
                      Review captions
                    </button>
                  </>
                )}
                {j.status !== "processing" && j.status !== "completed" && (
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      try {
                        await api(`/jobs/${j.id}`, {}, "DELETE");
                        refresh();
                      } catch (e) {
                        app.notify(e.message);
                      }
                    }}
                  >
                    Delete draft
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function Moderation({ app }) {
  const [data, setData] = useState(null),
    [pending, setPending] = useState(null),
    [reason, setReason] = useState(""),
    [days, setDays] = useState(7),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = () =>
    api("/admin/reports")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (pending.action === "restore")
        await api(`/admin/accounts/${pending.id}/restore`, { reason });
      else
        await api(`/admin/reports/${pending.id}`, {
          action: pending.action,
          reason,
          days,
        });
      setPending(null);
      setReason("");
      await refresh();
      app.notify("Review recorded.");
    } catch (e) {
      app.notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="content-page moderation-page">
      <div className="eyebrow">COMMUNITY CARE</div>
      <h1>
        Moderation<span>.</span>
      </h1>
      <p className="subheading">
        Review reports, take action, and keep a record of every decision.
      </p>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <form className="review-form" onSubmit={submit}>
          <h2>
            {pending.action === "restore"
              ? "Restore account"
              : pending.action === "remove"
                ? "Remove content"
                : pending.action === "suspend"
                  ? "Suspend account"
                  : "Dismiss report"}
          </h2>
          <label>
            Review reason
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {pending.action === "suspend" && (
            <label>
              Suspension length
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[1, 7, 30, 365].map((d) => (
                  <option value={d} key={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="studio-actions">
            <button className="primary" disabled={busy}>
              Record decision
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <h2>Report queue</h2>
      {data?.reports.map((r) => (
        <div className="report-card" key={r.id}>
          <div className="studio-row">
            <strong>{r.target_type} report</strong>
            <span className="status-pill">{r.status}</span>
          </div>
          <p>{r.content || "Content no longer available"}</p>
          <p>
            <strong>Reported reason:</strong> {r.reason}
          </p>
          <small>
            From @{r.reporter} · {r.created_at}
          </small>
          {r.target_type === "video" && (
            <button
              className="text-button"
              onClick={() => app.navigate(`/v/${r.target_id}`)}
            >
              View video
            </button>
          )}
          {r.status === "pending" && (
            <div className="studio-actions">
              <button
                className="secondary"
                onClick={() => setPending({ id: r.id, action: "dismiss" })}
              >
                Dismiss
              </button>
              {r.target_type !== "user" && (
                <button
                  className="secondary danger"
                  onClick={() => setPending({ id: r.id, action: "remove" })}
                >
                  Remove content
                </button>
              )}
              <button
                className="secondary"
                onClick={() => setPending({ id: r.id, action: "suspend" })}
              >
                Suspend creator
              </button>
            </div>
          )}
        </div>
      ))}
      {data && !data.reports.length && <p>The report queue is clear.</p>}
      <h2>Suspended accounts</h2>
      {data?.accounts.map((a) => (
        <div className="studio-row" key={a.id}>
          <span>
            @{a.username} · until{" "}
            {new Date(a.suspended_until).toLocaleDateString()}
          </span>
          <button
            className="secondary"
            onClick={() => setPending({ id: a.id, action: "restore" })}
          >
            Restore account
          </button>
        </div>
      ))}
      <h2>Review history</h2>
      {data?.actions.map((a) => (
        <div className="audit-row" key={a.id}>
          <strong>
            {a.action} · {a.target_type}
          </strong>
          <p>{a.reason}</p>
          <small>
            @{a.staff} · {a.created_at}
          </small>
        </div>
      ))}
    </section>
  );
}
