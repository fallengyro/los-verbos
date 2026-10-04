// voseá — speech recognition proxy (2026-10-04)
//
// For the Hablar test page (hablar-prueba.html): takes a short recording
// of someone saying a word or phrase, plus the text they were meant to say,
// and asks Azure Speech what it heard — the first step towards "Hablar"
// flashcards (see the project's roadmap doc). The test page exists to find
// out, before anything is built into the app, whether Azure understands
// Rioplatense speech ("sho" for yo, aspirated s, ...), and which locale's
// pronunciation scoring (if any) is fair to it.
//
// One request runs, in parallel:
//   - plain recognition in es-AR (what it heard + alternatives)
//   - pronunciation assessment against the reference text in each locale
//     asked for (default es-AR, es-ES, es-MX). A locale Azure doesn't
//     support for assessment just comes back as an error for that row.
// Audio is never stored.
//
// Uses the SAME secrets as the tts function, nothing new:
//   AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
// Deploy: supabase functions deploy stt   (JWT verification left ON, so
// only signed-in voseá accounts can use it). Or Dashboard → Edge Functions
// → Deploy a new function → name it "stt" and paste this file.
//
// Cost: Azure bills speech recognition per second of audio (a few-second
// clip is a fraction of a cent, and the free tier covers 5 hours a month).
// Each test recording is sent 1 + (number of locales) times.

import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";

var MAX_AUDIO_BYTES = 700 * 1024; // ~20 s of 16 kHz 16-bit mono WAV
var MAX_TEXT_LENGTH = 200;
var ALLOWED_LOCALES = ["es-AR", "es-ES", "es-MX", "es-US", "es-CO", "es-CL", "es-UY"];
var DEFAULT_ASSESS = ["es-AR", "es-ES", "es-MX"];

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
  });
}

function base64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToBase64(s) {
  var bytes = new TextEncoder().encode(s);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// A 16 kHz mono 16-bit PCM WAV, which is what Azure's short-audio REST
// endpoint wants (the test page converts the browser's recording to it).
function looksLikeWav(bytes) {
  if (bytes.length < 44) return false;
  var tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) + String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return tag === "RIFFWAVE";
}

async function recognize(region, key, locale, audio, referenceText) {
  var url = "https://" + region + ".stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1" +
    "?language=" + encodeURIComponent(locale) + "&format=detailed&profanity=raw";
  var headers = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
    "Accept": "application/json",
  };
  if (referenceText) {
    headers["Pronunciation-Assessment"] = utf8ToBase64(JSON.stringify({
      ReferenceText: referenceText,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      EnableMiscue: "True",
    }));
  }
  var started = Date.now();
  var resp;
  try {
    resp = await fetch(url, { method: "POST", headers: headers, body: audio });
  } catch (e) {
    return { ok: false, error: "request_failed: " + (e && e.message) };
  }
  var raw = "";
  try { raw = await resp.text(); } catch (e2) { /* ignore */ }
  if (!resp.ok) return { ok: false, status: resp.status, error: raw.slice(0, 300) || ("http_" + resp.status) };
  var data;
  try { data = JSON.parse(raw); } catch (e3) { return { ok: false, error: "bad_json: " + raw.slice(0, 200) }; }
  var nbest = Array.isArray(data.NBest) ? data.NBest : [];
  var top = nbest[0] || {};
  // Scores sit directly on the NBest entry in the REST response; some
  // versions nest them under PronunciationAssessment — accept either.
  var pa = top.PronunciationAssessment || top;
  var out = {
    ok: data.RecognitionStatus === "Success",
    recognitionStatus: data.RecognitionStatus,
    display: data.DisplayText || "",
    lexical: top.Lexical || "",
    confidence: typeof top.Confidence === "number" ? top.Confidence : null,
    alternatives: nbest.slice(1, 5).map(function (n) { return n.Lexical || n.Display || ""; }),
    ms: Date.now() - started,
  };
  if (referenceText) {
    out.scores = {
      pron: num(pa.PronScore),
      accuracy: num(pa.AccuracyScore),
      fluency: num(pa.FluencyScore),
      completeness: num(pa.CompletenessScore),
    };
    out.words = (Array.isArray(top.Words) ? top.Words : []).map(function (w) {
      var wpa = w.PronunciationAssessment || w;
      return {
        word: w.Word || "",
        accuracy: num(wpa.AccuracyScore),
        error: wpa.ErrorType || "None",
        phonemes: (Array.isArray(w.Phonemes) ? w.Phonemes : []).map(function (ph) {
          var ppa = ph.PronunciationAssessment || ph;
          return { p: ph.Phoneme || "", accuracy: num(ppa.AccuracyScore) };
        }),
      };
    });
  }
  return out;
}

function num(x) { return typeof x === "number" ? Math.round(x * 10) / 10 : null; }

export default {
  fetch: async function (req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

    var body;
    try { body = await req.json(); } catch (e) { return jsonResponse({ error: "invalid_json" }, 400); }

    var text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return jsonResponse({ error: "missing_text" }, 400);
    if (text.length > MAX_TEXT_LENGTH) return jsonResponse({ error: "text_too_long" }, 400);
    if (typeof body.audio !== "string" || !body.audio) return jsonResponse({ error: "missing_audio" }, 400);

    var audio;
    try { audio = base64ToBytes(body.audio); } catch (e) { return jsonResponse({ error: "bad_audio_encoding" }, 400); }
    if (audio.length > MAX_AUDIO_BYTES) return jsonResponse({ error: "audio_too_long" }, 400);
    if (!looksLikeWav(audio)) return jsonResponse({ error: "audio_not_wav" }, 400);

    var assess = Array.isArray(body.assess) ? body.assess.filter(function (l) { return ALLOWED_LOCALES.indexOf(l) !== -1; }) : DEFAULT_ASSESS;
    assess = assess.slice(0, 4);

    var key = Deno.env.get("AZURE_SPEECH_KEY");
    var region = Deno.env.get("AZURE_SPEECH_REGION");
    if (!key || !region) return jsonResponse({ error: "stt_not_configured" }, 500);

    var jobs = [recognize(region, key, "es-AR", audio, null)].concat(
      assess.map(function (loc) { return recognize(region, key, loc, audio, text); })
    );
    var results = await Promise.all(jobs);
    return jsonResponse({
      heard: results[0],
      assessments: assess.map(function (loc, i) { return Object.assign({ locale: loc }, results[i + 1]); }),
    });
  },
};
