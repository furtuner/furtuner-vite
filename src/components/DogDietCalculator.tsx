"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
interface IngredientItem {
  ingredient_name: string;
  group_name: string;
}

// ─── Ingredients prefetch cache ────────────────────────────────────────────
// Kicked off as soon as the user picks a diet type (see selectDiet), well
// before they reach the Ingredients page — by the time they get there the
// data is usually already resolved, so there's no visible loading flash.
// Keyed by API base URL so each pet/diet combination caches independently.
const ingredientsResolvedCache: Record<string, IngredientItem[]> = {};
const ingredientsPrefetchCache: Record<string, Promise<IngredientItem[]>> = {};

function prefetchIngredients(apiBase: string): Promise<IngredientItem[]> {
  if (!ingredientsPrefetchCache[apiBase]) {
    ingredientsPrefetchCache[apiBase] = fetch(`${apiBase}/user-ingredients`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: IngredientItem[]) => {
        ingredientsResolvedCache[apiBase] = data;
        return data;
      })
      .catch(e => {
        // Don't cache a failed attempt — let a later real fetch (e.g. from
        // the Ingredients page itself) retry and surface the error there.
        delete ingredientsPrefetchCache[apiBase];
        throw e;
      });
  }
  return ingredientsPrefetchCache[apiBase];
}

interface CategoryMeta {
  clean: string;
  mandatory: boolean;
  max: number;
  items: string[];
  selected: string[];
}

interface BreakdownRow {
  ingredient: string;
  dm_g: number;
  fresh_weight_g: number;
  water_percent: number;
  fixed: boolean;
}

interface IngredientTotal {
  ingredient: string;
  dm_g: number;
  protein_g: number;
  fat_g: number;
  cho_g: number;
  fiber_g: number;
  ash_g: number;
  calcium_mg: number;
  phosphorus_mg: number;
  iron_mg: number;
  energy_kcal: number;
}

interface CalcResult {
  Energy: number;
  Protein_percent: number;
  Fat_percent: number;
  CHO_percent: number;
  Fiber_percent: number;
  Ca_P_ratio: number;
  Ca_percent: number;
  P_percent: number;
  omega6_omega3_ratio: number;
  iron_mg: number;
  total_fresh_weight_g: number;
  issues: string[];
  dm_breakdown: BreakdownRow[];
  ingredient_totals: IngredientTotal[];
  aafco_percent_of_minimum: Record<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
type PetType = "dog" | "cat";
type DietType = "conventional" | "grainfree" | "raw";

const API_BASES: Record<string, string> = {
  dog_conventional: "https://furtuner-deploy-dog-conventional.vercel.app",
  cat_conventional: "https://futuner-deploy-cat-conventional.vercel.app",
  dog_grainfree:    "https://furtuner-deploy-dog-grain-free.vercel.app",
  dog_raw:          "https://futuner-deploy-dog-meat-based.vercel.app",
  cat_grainfree:    "https://futuner-deploy-cat-grain-free.vercel.app",
  cat_raw:          "https://futuner-deploy-cat-meat-based.vercel.app",
};

// Stripe-hosted checkout page. Redirecting here means the actual card fields
// are handled entirely by Stripe — this app never sees card data.
//
// TESTING: set STRIPE_TEST_MODE to true to use the test-mode Payment Link
// (works only with Stripe's fake test cards, e.g. 4242 4242 4242 4242 — no
// real money moves). Set back to false before real customers use the site.
const STRIPE_TEST_MODE = false;
const STRIPE_PAYMENT_LINK_LIVE = "https://buy.stripe.com/cNidR1gYd815e2l8jQ7Re00";
const STRIPE_PAYMENT_LINK_TEST = "https://buy.stripe.com/test_cNidR1gYd815e2l8jQ7Re00";
const STRIPE_PAYMENT_LINK = STRIPE_TEST_MODE ? STRIPE_PAYMENT_LINK_TEST : STRIPE_PAYMENT_LINK_LIVE;
// Query param Stripe's "after payment" redirect appends back to this app so
// we know to unlock the feeding plan when the user returns.
const STRIPE_RETURN_PARAM = "paw_payment";
// sessionStorage key used to restore the wizard (pet/diet/profile/results)
// after the full-page redirect to Stripe and back.
const CHECKOUT_STORAGE_KEY = "pawBalancerCheckout";

// ─── Paid-customer logging (Google Sheet, no backend involved) ───────────
// The customer's Name + Email get logged the moment they land back on this
// page after paying — no Stripe webhook, no backend at all. Simpler to set
// up, but there's a real trade-off worth knowing: this fires off the
// ?paw_payment=success URL param alone, the same param that already
// unlocks the feeding plan. It is NOT cryptographic proof of payment the
// way a signed Stripe webhook is — someone could in principle craft that
// URL by hand and get logged (and get the unlocked plan) without paying.
// If that risk matters more to you later, the webhook-based version is the
// fix; this version trades that guarantee for "one file, zero Stripe
// Dashboard config."
//
// SHARED_SECRET_NOTE: because this request comes straight from the
// customer's browser, this "secret" ships inside your bundled JS and is
// visible to anyone who opens dev tools — it is NOT actually secret. It
// only filters out random bots hitting the Apps Script URL blind; it does
// not stop someone who deliberately reads your source.
const SHEETS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyVuGarwlvkhx0Rovimy-soQqyzH1UJFNvrk73-u-N444RE2W6w1oeNCPeQMRhnatCP_w/exec";
const SHEETS_SHARED_SECRET = "furtuner-sheet-7f3k9d2x-secret";

/**
 * Fires a one-way POST to the Apps Script Web App so it appends a row to
 * the Google Sheet. Uses `mode: "no-cors"` because Apps Script Web Apps
 * don't send back CORS headers — that means we can never read a response
 * or know for sure it succeeded from here, so this is intentionally
 * fire-and-forget. Never throws — a logging hiccup must never block the
 * customer from seeing their unlocked report.
 */
function logPaidCustomerToSheet(
  customer: { fullName: string; email: string } | null,
  petType: PetType | null,
  dietType: DietType | null
) {
  if (!customer?.email) return;
  if (!SHEETS_WEBAPP_URL || SHEETS_WEBAPP_URL.startsWith("PASTE_")) return;

  try {
    fetch(SHEETS_WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" }, // avoids a CORS preflight
      body: JSON.stringify({
        secret: SHEETS_SHARED_SECRET,
        name: customer.fullName || "",
        email: customer.email,
        pet_type: petType || "",
        diet_type: dietType || "",
        // Client-generated id, just so a page refresh/double-fire doesn't
        // create two rows for the same visit — see the .gs file's dedupe.
        request_id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    }).catch(() => {
      // Nothing we can do about a network failure here — there's no
      // response to inspect either way under no-cors mode.
    });
  } catch {
    // Fetch not available / blocked (e.g. very old browser) — never let
    // this take down the report page.
  }
}


const CAT_DIETS: { value: DietType; label: string; emoji: string }[] = [
  { value: "conventional", label: "Conventional", emoji: "🥩" },
  { value: "grainfree",    label: "Grain-Free",   emoji: "🥦" },
  { value: "raw",          label: "Meat—Based",   emoji: "🦴" },
];

const DOG_DIETS: { value: DietType; label: string; emoji: string }[] = [
  { value: "conventional", label: "Conventional", emoji: "🥩" },
  { value: "grainfree",    label: "Grain-Free",   emoji: "🥦" },
  { value: "raw",          label: "Meat—Based",   emoji: "🦴" },
];

// Display-name overrides — shows a nicer/corrected label without changing
// the underlying value used for selection/toggling logic
const INGREDIENT_DISPLAY_OVERRIDES: Record<string, string> = {
  "Eggshells": "Eggshells \"Powder\"",
};

// Single source of truth for how an ingredient name is shown anywhere in
// the app (selection pills, results table, printed report) — lowercased
// throughout for consistency, plus specific word-merges like "beet root"
// -> "beetroot".
function formatIngredientName(name: string): string {
  const overridden = INGREDIENT_DISPLAY_OVERRIDES[name] ?? name;
  return overridden
    .toLowerCase()
    .replace(/\bbeet\s+root\b/g, "beetroot");
}

const MAX_MAP: Record<string, number> = {
  // ── Dog Conventional ──
  "01 Meat Group A (Mandatory - Select at least one and a maximum of three)": 3,
  "02 Meat Group B (Optional - Pick up to two maximum)": 2,
  "03 Meat Group C (Optional - Pick up to two maximum)": 2,
  "04 Organ Meat - Other (Optional - Pick up to three maximum)": 3,
  "05 Organ Meat - Liver (Mandatory - Select one up to two maximum)": 2,
  "06 Grain A (Mandatory - Select at least one and a maximum of three)": 3,
  "07 Grain B (Optional - Pick up to two maximum)": 2,
  "08 Vegetable A (Mandatory - Select at least one and up to three maximum)": 3,
  "09 Vegetable B (Optional - Pick up to three maximum)": 3,
  "10 Vegetable C - Potatoes (Optional - Pick up to one)": 1,
  "11 Fruit (Mandatory - Select at least one and up to three maximum)": 3,
  "12 Oil (Mandatory - Select at least one and a maximum of three)": 3,
  "13 Others (Optional - Pick up to two maximum)": 2,
  // ── Cat Conventional ──
  "02 Meat Group B (Optional - Pick up to one)": 2,
  "03 Meat Group C (Optional - Pick up to one)": 2,
  "04 Organ Meat - Other (Optional - Pick up to one)": 2,
  "05 Organ Meat - Liver (Mandatory - Select one)": 2,
  "07 Grain B (Optional - Pick up to one)": 1,
  "09 Vegetable B (Optional - Pick up to two)": 2,
  "11 Fruit (Optional - Up to two maximum)": 2,
  // ── Cat Grain-Free ──
  "06 Grain A (Mandatory - Select at least one and a maximum of three, fixed at 110g) [Quinoa, Tapioca, Potatoes, Sweet Potatoes]": 3,
  "08 Vegetable B (Optional - Select at least one, up to three)": 2,
  "09 Fruit (Optional - Select upto three maximum)": 2,
  // ── Dog Grain-Free ──
  "02 Meat Group B (Optional - Select upto two maximum)": 2,
  "03 Meat Group C (Optional - Select upto two maximum)": 2,
  "04 Organ Meat - Other (Optional - Select upto three maximum)": 3,
  "05 Organ Meat - Liver (Mandatory - Select upto two maximum)": 2,
  "06 Grain A (Mandatory - Select at least one and a maximum of three, fixed at 30%) [Quinoa, Tapioca, Potatoes, Sweet Potatoes]": 3,
  "07 Vegetable A (Mandatory - Select at least one, up to three)": 3,
  "08 Vegetable B (Mandatory - Select at least one, up to three)": 3,
  "09 Fruit (Mandatory - Select upto three maximum)": 3,
  "10 Oil (Mandatory - Select at least one and a maximum of three)": 3,
  // ── Dog Raw ──
  "02 Meat Group B (Optional - Pick up to two)": 2,
  "03 Meat Group C (Optional - Pick up to two)": 2,
  "04 Organ Meat - Other (Optional - Pick up to three)": 3,
  "05 Organ Meat - Liver (Mandatory - Pick up to 2)": 2,
  "06 Grains (Optional - Select up to three maximum)": 3,
  "07 Vegetable A (Mandatory - Select at least one and up to three maximum)": 3,
  "08 Vegetable B (Optional - Pick up to three maximum)": 3,
  "09 Fruit (Mandatory - Select at least one and up to three maximum)": 3,
  "11 Fiber/Seeds (Optional - Pick up to two maximum)": 2,
  // ── Cat Raw ──
  "06 Grains & Potato (Optional - Select up to two maximum)": 2,
  "07 Vegetables (Mandatory - Select at least one and up to three maximum)": 3,
  "08 Fruit (Optional - Select up to three maximum)": 3,
  "09 Oil (Mandatory - Select at least one and a maximum of three)": 3,
  "10 Fiber/Seeds (Optional - Pick up to two maximum)": 2,
};

// ─── Liability Disclaimer content (sourced from LIABILITY_DISCLAIMER.docx) ───
const DISCLAIMER_ITEMS: { type: "title" | "meta" | "important" | "heading" | "shout" | "bullet" | "para"; text: string }[] = [
  { type: "title", text: "FURTUNER LIABILITY DISCLAIMER AND LIMITATION OF LIABILITY" },
  { type: "meta", text: "Last Updated: [10/1/2026]" },
  { type: "important", text: "IMPORTANT: PLEASE READ THIS DISCLAIMER CAREFULLY BEFORE USING FURTUNER OR FEEDING ANY DIET GENERATED THROUGH THE PLATFORM." },
  { type: "heading", text: "1. PURPOSE OF THE PLATFORM" },
  { type: "para", text: "FurTuner is a diet formulation platform designed to assist pet owners in formulating homemade diets for healthy adult dogs and cats. The information, recommendations, nutrient analyses, and recipes generated by FurTuner are provided for informational and educational purposes only and are not intended to replace professional veterinary care, diagnosis, treatment, or nutritional consultation. By using FurTuner, you acknowledge and agree that you are solely responsible for evaluating the suitability of any diet generated by the platform for your individual pet." },
  { type: "heading", text: "2. HEALTHY ADULT PETS ONLY" },
  { type: "para", text: "FurTuner is intended exclusively for healthy adult dogs and cats. The platform is not intended for puppies, kittens, pregnant or lactating animals, senior pets with special nutritional needs, pets with medical conditions, diseases, allergies, sensitivities, or metabolic disorders or pets receiving veterinary treatment or therapeutic diets. Users are responsible for consulting with their veterinarian before feeding any diet generated through the platform to pets with any health condition or special nutritional requirement." },
  { type: "heading", text: "3. NUTRIENT DATABASE LIMITATIONS" },
  { type: "para", text: "FurTuner formulates diets using nutrient composition data obtained primarily from the United States Department of Agriculture (USDA) FoodData Central database and other recognized nutrient databases when applicable. Users acknowledge that actual nutrient composition of foods may vary substantially from database values due to factors including but not limited to geographic origin, crop variety or animal breed, seasonal variations, agricultural practices, storage conditions, manufacturing methods, processing techniques, cooking temperature, cooking duration, moisture loss during cooking and supplier differences. Accordingly, FurTuner does not guarantee that the actual nutrient content of any prepared diet will exactly match the nutrient analysis displayed by the platform." },
  { type: "heading", text: "4. PREPARATION AND MIXING RESPONSIBILITY" },
  { type: "para", text: "The accuracy and nutritional adequacy of a generated recipe depend upon the user's ability to select ingredients correctly, purchase ingredients matching those specified, accurately weigh and measure ingredients, follow preparation instructions, properly cook ingredients, properly mix all ingredients and properly store ingredients. FurTuner assumes no responsibility for errors, omissions, substitutions, ingredient changes, inaccurate measurements, preparation mistakes, mixing errors, contamination, spoilage, storage failures, or deviations from the generated recipe. Any modification made by the user may alter the nutritional adequacy of the diet." },
  { type: "heading", text: "5. NO GUARANTEE OF OUTCOMES" },
  { type: "para", text: "FurTuner makes no representation or warranty that any diet generated by the platform will prevent disease, treat disease, cure disease, improve health, produce specific health outcomes and be suitable for every individual pet. Individual animals may respond differently to identical diets due to genetics, health status, lifestyle, environment, metabolism, and numerous other factors beyond the control of FurTuner." },
  { type: "heading", text: "6. MONITORING OF PET HEALTH" },
  { type: "para", text: "Pet owners are solely responsible for monitoring their pet's health and response to any diet generated through FurTuner. If a pet exhibits any unusual signs, including but not limited to vomiting, diarrhea, constipation, reduced appetite, excessive thirst, excessive urination, weight loss, weight gain, skin problems, behavioral changes, lethargy, or any other abnormal clinical signs, the owner must immediately discontinue feeding the diet and consult a licensed veterinarian. If concerns exist regarding the nutrient content of a prepared diet, the owner should submit representative samples to a qualified commercial laboratory for nutrient analysis before continuing long-term feeding." },
  { type: "heading", text: "7. NO VETERINARY OR MEDICAL RELATIONSHIP" },
  { type: "para", text: "Use of FurTuner does not create a veterinarian-client-patient relationship, a nutritionist-client relationship, a professional consulting relationship or any fiduciary relationship. No information provided through the platform should be interpreted as veterinary diagnosis, treatment, or individualized nutritional advice." },
  { type: "heading", text: "8. ASSUMPTION OF RISK" },
  { type: "para", text: "By using FurTuner, users knowingly and voluntarily assume all risks associated with diet formulation, food preparation, food handling, food storage, nutrient variability, ingredient sourcing and feeding homemade diets. Users understand that feeding any homemade diet carries inherent risks and that outcomes cannot be guaranteed." },
  { type: "heading", text: "9. DISCLAIMER OF WARRANTIES" },
  { type: "para", text: "FurTuner is provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied. To the maximum extent permitted by law, FurTuner disclaims all warranties, including but not limited to merchantability, fitness for a particular purpose, accuracy, completeness, reliability and non-infringement." },
  { type: "heading", text: "10. LIMITATION OF LIABILITY" },
  { type: "para", text: "To the maximum extent permitted by law, FurTuner, its owners, developers, affiliates, employees, consultants, contractors, officers, directors, agents, and representatives shall not be liable for any direct, indirect, incidental, special, consequential, exemplary, or punitive damages arising from or related to use of the platform, reliance on information provided by the platform, recipe generation, ingredient selection, food preparation, food storage, nutrient variability, nutritional deficiencies, nutritional excesses, illness, injury, allergic reactions, veterinary expenses, property damage, loss of profits, or death of an animal. This limitation applies regardless of the legal theory asserted and even if FurTuner has been advised of the possibility of such damages." },
  { type: "heading", text: "11. INDEMNIFICATION" },
  { type: "para", text: "Users agree to defend, indemnify, and hold harmless FurTuner, its owners, affiliates, employees, contractors, consultants, and representatives from any claims, liabilities, damages, losses, costs, expenses, or legal fees arising from use of the platform, feeding of generated diets, recipe modifications, failure to follow instructions, violation of these terms, and claims brought by third parties." },
  { type: "heading", text: "12. USER ACKNOWLEDGMENT" },
  { type: "para", text: "By using FurTuner, the user acknowledges that:" },
  { type: "bullet", text: "They have read and understood this disclaimer." },
  { type: "bullet", text: "They understand the limitations of nutrient databases." },
  { type: "bullet", text: "They understand that actual food composition may differ from database values." },
  { type: "bullet", text: "They understand that food processing can alter nutrient content." },
  { type: "bullet", text: "They assume all risks associated with feeding generated diets." },
  { type: "bullet", text: "They accept full responsibility for ingredient selection, preparation, and feeding decisions." },
  { type: "bullet", text: "They release FurTuner and its representatives from liability to the fullest extent permitted by law." },
  { type: "heading", text: "13. GOVERNING LAW" },
  { type: "para", text: "This disclaimer shall be governed by and construed in accordance with the laws of the State of Illinois, United States, without regard to conflict-of-law principles." },
];

function parseMeta(groupName: string): { clean: string; mandatory: boolean; min: number; max: number } {
  const mandatory = /mandatory/i.test(groupName) || /mineral group a/i.test(groupName);
  const max = MAX_MAP[groupName] ?? 99;
  const min = mandatory ? 1 : 0;
  const clean = groupName.replace(/^\d+\s+/, "").replace(/\s*\(.*?\)\s*/g, "").replace(/\s*\[.*?\]\s*/g, "").trim();
  return { mandatory, min, max, clean };
}

const SUPERGROUP_ORDER = ["Organ Meat", "Meat", "Grain", "Vegetable", "Fruit", "Oil", "Fiber", "Mineral", "Others"];

function superGroupOf(clean: string): string {
  for (const key of SUPERGROUP_ORDER) {
    if (new RegExp(key, "i").test(clean)) {
      // Some diets' backend data labels this category "Fiber/Seeds", others
      // label the same kind of category "Others" — both should display the
      // same way rather than showing a generic, unhelpful "Others" header.
      if (key === "Fiber" || key === "Others") return "Fiber & Seeds";
      return key;
    }
  }
  return clean;
}

function subLabelOf(clean: string, superGroup: string): string | null {
  let rest = clean.replace(new RegExp("^" + superGroup.replace(" & Seeds", ""), "i"), "").trim();
  rest = rest.replace(/^[-\s]+/, "").trim();
  return rest.length > 0 ? rest : null;
}

// Mirrors the section heading text actually shown on screen for a given
// category (see the h3 rendering in IngredientsPage) — used so validation
// messages reference the same label the customer sees, e.g. "Carbohydrate
// (Grain)" rather than the raw backend category name "Grain A".
function displayLabelFor(clean: string, dietType?: DietType | null): string {
  const superGroup = superGroupOf(clean);
  if (superGroup === "Grain") {
    return dietType === "grainfree" ? "Carbohydrate (Non-Grain)" : "Carbohydrate (Grain)";
  }
  return superGroup;
}

// ─── Metric helpers ───────────────────────────────────────────────────────────
function metricStatus(val: number | null, min: number | null, max: number | null): "good" | "warn" | "bad" | "" {
  if (val === null || val === undefined) return "";
  if (min === null && max === null) return "";
  if ((min !== null && val < min) || (max !== null && val > max)) return "bad";
  if (min !== null && val < min * 1.1) return "warn";
  if (max !== null && val > max * 0.9) return "warn";
  return "good";
}

const STATUS_COLORS = {
  good: { bg: "bg-[#E0F2FF]", border: "border-[#3C6293]", text: "text-[#143C6F]", dot: "bg-[#3C6293]" },
  warn: { bg: "bg-[#FFDCB7]", border: "border-[#FFB160]", text: "text-[#FF9D36]", dot: "bg-[#FFB160]" },
  bad:  { bg: "bg-[#FDEBEC]",    border: "border-[#B02424]",    text: "text-[#AD0B39]",   dot: "bg-[#B02424]" },
  "":   { bg: "bg-white",     border: "border-[#A6CCE8]",  text: "text-[#143C6F]", dot: "bg-[#3C6293]" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <h2
      className="text-[#3C6293] mb-6"
      style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 5vw, 55px)", fontWeight: 400 }}
    >
      Step {step} Of 5
    </h2>
  );
}

function CardHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="bg-[#143C6F] rounded-t-[10px]" style={{ padding: "30px 40px" }}>
      <h3 className="text-white leading-tight" style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 600, fontSize: "42px" }}>{title}</h3>
      {desc && <p className="text-[#FFC588] font-semibold" style={{ marginTop: "8px", fontSize: "20px", lineHeight: 1.5 }}>{desc}</p>}
    </div>
  );
}

// ─── Page 1: Dog Profile ──────────────────────────────────────────────────────
type ActivityLevel = "Active" | "Moderately Active" | "Very Active" | "Indoor Sedentary" | "";

interface ProfileData {
  dogName: string;
  breed: string;
  age: string;
  sex: "M" | "F" | "";
  repro: "Intact" | "Neutered/Spayed" | "";
  activity: ActivityLevel;
  weightKg: string;
  weightLb: string;
}

// Activity level multipliers
const ACTIVITY_MULTIPLIER: Record<string, number> = {
  "Active":             0.10,
  "Moderately Active":  0.05,
  "Very Active":        0.20,
  "Indoor Sedentary":   0.00,
};

function ProfilePage({
  onNext,
  onBack,
  initialValues,
  dietType,
  onSelectPet,
  onSelectDiet,
}: {
  onNext: (raw: ProfileData, p: ReturnType<typeof buildProfile>) => void;
  onBack: () => void;
  initialValues?: ProfileData;
  dietType?: DietType | null;
  onSelectPet?: (t: PetType) => void;
  onSelectDiet?: (t: DietType) => void;
}) {
  const [form, setForm] = useState<ProfileData>(initialValues ?? {
    dogName: "", breed: "", age: "",
    sex: "", repro: "", activity: "",
    weightKg: "", weightLb: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");

  function updateAgeFromParts(years: string, months: string) {
    setAgeYears(years);
    setAgeMonths(months);
    set("age", formatAgeFromParts(years, months));
  }

  function set(k: keyof ProfileData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  }

  function handleKgChange(raw: string) {
    // Accept comma as a decimal separator (e.g. "4,5") in addition to a
    // period. The displayed/stored value keeps whatever the user actually
    // typed (comma stays a comma). The auto-computed lb value also uses
    // whichever separator was typed, so both fields stay visually
    // consistent instead of one using a comma and the other a period.
    const forCalc = raw.replace(",", ".");
    const kg = parseFloat(forCalc);
    const usesComma = raw.includes(",");
    let computedLb = "";
    if (raw && !isNaN(kg)) {
      computedLb = (kg / 0.453592).toFixed(2);
      if (usesComma) computedLb = computedLb.replace(".", ",");
    }
    setForm(f => ({
      ...f,
      weightKg: raw,
      weightLb: raw && !isNaN(kg) ? computedLb : f.weightLb,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  function handleLbChange(raw: string) {
    const forCalc = raw.replace(",", ".");
    const lb = parseFloat(forCalc);
    const usesComma = raw.includes(",");
    let computedKg = "";
    if (raw && !isNaN(lb)) {
      computedKg = (lb * 0.453592).toFixed(2);
      if (usesComma) computedKg = computedKg.replace(".", ",");
    }
    setForm(f => ({
      ...f,
      weightLb: raw,
      weightKg: raw && !isNaN(lb) ? computedKg : f.weightKg,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  const weightKgNum = parseFloat(form.weightKg) || null;
  const base = weightKgNum && weightKgNum > 0 ? 70 * Math.pow(weightKgNum, 0.75) : null;
  const baseDenIntact   = base ? Math.round(base * 1.8) : null;
  const baseDenNeutered = base ? Math.round(base * 1.6) : null;
  const baseDen = form.repro === "Intact" ? baseDenIntact : form.repro === "Neutered/Spayed" ? baseDenNeutered : null;
  const actMult = form.activity ? ACTIVITY_MULTIPLIER[form.activity] ?? 0 : 0;
  const finalDen = baseDen ? Math.round(baseDen * (1 + actMult)) : null;

  function validate() {
    const e: Record<string, string> = {};
    if (!form.dogName.trim()) e.dogName = "Please enter your dog's name.";
    if (!form.age.trim()) e.age = "Please enter your dog's age.";
    if (!form.sex) e.sex = "Please select a sex.";
    if (!form.repro) e.repro = "Please select reproductive status.";
    if (!form.activity) e.activity = "Please select an activity level.";
    if (!form.weightKg || parseFloat(form.weightKg) <= 0) e.weightKg = "Please enter a valid body weight.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onNext(form, buildProfile(form));
  }

  return (
    <div className="border-[2px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ border: "2px solid #3C6293", borderRadius: "12px" }}>
      <CardHeader
        title="Dog Profile"
        eyebrow="Step 1 of 3"
      />
      <div className="bg-white grid grid-cols-1 md:grid-cols-2" style={{ padding: "32px", columnGap: "0px" }}>
        <div className="md:pr-8 md:border-r-[1.5px] md:border-[#3C6293]" style={{ paddingRight: "32px", borderRight: "1.5px solid #3C6293" }}>
          <SectionLabel>Basic Information</SectionLabel>
          <div className="space-y-4" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Field label="Dog Name *" error={errors.dogName}>
              <input className={inputCls(!!errors.dogName)} value={form.dogName}
                onChange={e => set("dogName", e.target.value)} placeholder="e.g. Buddy" />
            </Field>
            <Field label="Breed">
              <input className={inputCls(false)} value={form.breed}
                onChange={e => set("breed", e.target.value)} placeholder="e.g. Golden Retriever" />
            </Field>
            <AgeYearMonthPicker
              years={ageYears}
              months={ageMonths}
              onYearsChange={v => updateAgeFromParts(v, ageMonths)}
              onMonthsChange={v => updateAgeFromParts(ageYears, v)}
            />
            <Field label="Age *" error={errors.age}>
              <input className={inputCls(!!errors.age, true)} value={form.age}
                readOnly
                style={{ cursor: "not-allowed", opacity: 0.75 }}
                placeholder="e.g. 3 years / 8 months" />
            </Field>
            <Field label="Sex *" error={errors.sex}>
              <PillGroup
                name="sex" value={form.sex}
                options={[{ value: "M", label: "♂ Male" }, { value: "F", label: "♀ Female" }]}
                onChange={v => set("sex", v)}
              />
            </Field>
          </div>
        </div>

        <div className="md:pl-8 mt-8 md:mt-0" style={{ paddingLeft: "32px", marginTop: "0" }}>
          <SectionLabel>Reproductive Status &amp; Activity</SectionLabel>
          <div className="space-y-4" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Field label="Reproductive Status *" error={errors.repro}>
              <PillGroup
                name="repro" value={form.repro}
                options={[
                  { value: "Intact", label: "Intact" },
                  { value: "Neutered/Spayed", label: "Neutered / Spayed" },
                ]}
                onChange={v => set("repro", v)}
              />
            </Field>
            <Field label="Activity Level *" error={errors.activity}>
              <select
                value={form.activity}
                onChange={e => set("activity", e.target.value)}
                className={`${inputCls(!!errors.activity)} appearance-none cursor-pointer`}
                style={{ fontWeight: 700, fontSize: "21px" }}
              >
                <option value="" style={{ fontWeight: 700, fontSize: "21px", color: "#3C6293" }}>— Select activity level —</option>
                <option value="Active" style={{ fontWeight: 700, fontSize: "21px", color: "#211915" }}>Active</option>
                <option value="Moderately Active" style={{ fontWeight: 700, fontSize: "21px", color: "#211915" }}>Moderately Active</option>
                <option value="Very Active" style={{ fontWeight: 700, fontSize: "21px", color: "#211915" }}>Very Active</option>
                <option value="Indoor Sedentary" style={{ fontWeight: 700, fontSize: "21px", color: "#211915" }}>Indoor Sedentary</option>
              </select>
            </Field>
          </div>

          <div className="mt-6" style={{ marginTop: "24px" }}>
            <SectionLabel>Body Weight</SectionLabel>
            <div className="grid grid-cols-2" style={{ gap: "16px" }}>
              <Field label="Weight (kg) *" error={errors.weightKg}>
                <input type="text" inputMode="decimal"
                  className={inputCls(!!errors.weightKg, true)} value={form.weightKg}
                  onChange={e => handleKgChange(e.target.value)} placeholder="e.g. 25.0" />
              </Field>
              <Field label="Weight (lb)">
                <input type="text" inputMode="decimal"
                  className={inputCls(false, true)} value={form.weightLb}
                  onChange={e => handleLbChange(e.target.value)} placeholder="e.g. 55.1" />
              </Field>
            </div>
            {base && form.repro && form.activity && finalDen && (
              <div className="flex items-center justify-between gap-4" style={{ marginTop: "28px", background: "#E0F2FF", borderRadius: "14px", padding: "20px 24px" }}>
                <div>
                  <p className="font-bold uppercase tracking-wider" style={{ color: "#DE7100", fontSize: "18px" }}>Daily Energy Need</p>
                  <p className="font-bold" style={{ color: "#143C6F", fontSize: "13px", marginTop: "4px" }}>{form.repro} · {form.activity}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[40px] font-bold leading-none" style={{ color: "#143C6F" }}>{finalDen.toLocaleString()}</p>
                  <p className="font-semibold" style={{ color: "#DE7100", fontSize: "16px", marginTop: "6px" }}>kcal / day</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 flex gap-3" style={{ marginTop: "36px" }}>
          <button onClick={onBack} type="button"
            className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
            style={{
              fontFamily: "'Parastoo', sans-serif",
              fontWeight: 700,
              fontSize: "18px",
              padding: "18px 28px",
              borderRadius: "12px",
            }}
          >
            ← Back
          </button>
          <button onClick={submit}
            className="flex-1 bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
            style={{
              fontFamily: "'Parastoo', sans-serif",
              fontWeight: 700,
              fontSize: "18px",
              padding: "18px 24px",
              borderRadius: "12px",
              gap: "10px",
              letterSpacing: "0.02em",
            }}
          >
            Proceed to Ingredient Selection <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page 1: Cat Profile ──────────────────────────────────────────────────────
interface CatProfileData {
  catName: string;
  breed: string;
  age: string;
  sex: "M" | "F" | "";
  repro: string[];
  weightKg: string;
  weightLb: string;
}

// Cat DEN multipliers: RER = 70 x W^0.75
// Intact x1.4, Neutered x1.2, Obese x1.0
const CAT_DEN_MULTIPLIER: Record<string, number> = {
  "Intact":   1.4,
  "Neutered": 1.2,
  "Obese":    1.0,
};

// Reproductive status now allows multiple selections (e.g. "Neutered" + "Obese").
// Whenever more than one status is selected — whether or not "Obese" is one of
// them — the calculation always uses the Obese multiplier. A single selection
// uses that status's own multiplier.
function getCatDenMultiplier(repro: string[]): number {
  if (repro.length >= 2 || repro.includes("Obese")) return CAT_DEN_MULTIPLIER["Obese"];
  if (repro.includes("Intact")) return CAT_DEN_MULTIPLIER["Intact"];
  if (repro.includes("Neutered")) return CAT_DEN_MULTIPLIER["Neutered"];
  return 1.2;
}

function buildCatProfile(form: CatProfileData) {
  const wkg = parseFloat(form.weightKg);
  const rer = 70 * Math.pow(wkg, 0.75);
  const mult = getCatDenMultiplier(form.repro);
  const den = Math.round(rer * mult);
  return {
    dogName:       form.catName.trim(),
    breed:         form.breed.trim(),
    age:           form.age.trim(),
    sex:           form.sex,
    repro:         form.repro,
    activity:      "N/A",
    weightKg:      parseFloat(wkg.toFixed(2)),
    weightDisplay: `${form.weightKg} kg / ${form.weightLb} lb`,
    den,
    rer:            Math.round(rer),
    activityFactor: parseFloat(mult.toFixed(2)),
  };
}

function CatProfilePage({
  onNext,
  onBack,
  initialValues,
  dietType,
  onSelectPet,
  onSelectDiet,
}: {
  onNext: (raw: CatProfileData, p: ReturnType<typeof buildCatProfile>) => void;
  onBack: () => void;
  initialValues?: CatProfileData;
  dietType?: DietType | null;
  onSelectPet?: (t: PetType) => void;
  onSelectDiet?: (t: DietType) => void;
}) {
  const [form, setForm] = useState<CatProfileData>(initialValues ?? {
    catName: "", breed: "", age: "",
    sex: "", repro: [],
    weightKg: "", weightLb: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  // Tracked separately from form.repro (not stored in it) — adding "Normal" as a
  // literal value into form.repro would break getCatDenMultiplier's `repro.length
  // >= 2` check, which is used specifically to detect Obese. This just controls
  // whether the Body Condition pill row shows anything highlighted yet, forcing
  // the user to make an explicit choice instead of "Normal" looking pre-selected.
  const [bodyConditionTouched, setBodyConditionTouched] = useState(false);

  function updateAgeFromParts(years: string, months: string) {
    setAgeYears(years);
    setAgeMonths(months);
    set("age", formatAgeFromParts(years, months));
  }

  function set(k: keyof CatProfileData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  }

  function toggleRepro(v: string) {
    setForm(f => ({
      ...f,
      repro: f.repro.includes(v) ? f.repro.filter(x => x !== v) : [...f.repro, v],
    }));
    setErrors(e => ({ ...e, repro: "" }));
  }

  // Reproductive Status (Intact/Neutered) and Body Condition (Normal/Obese)
  // are now two separate single-select rows, but both still write into the
  // same form.repro array so the existing "Obese always wins" multiplier
  // logic (getCatDenMultiplier) keeps working without any changes.
  function setReproStatus(v: "Intact" | "Neutered" | "") {
    setForm(f => ({
      ...f,
      repro: v === "" ? f.repro.filter(x => x === "Obese") : [v, ...f.repro.filter(x => x === "Obese")],
    }));
    setErrors(e => ({ ...e, repro: "" }));
  }

  function setBodyCondition(v: "Normal" | "Obese" | "") {
    setBodyConditionTouched(v !== "");
    setForm(f => {
      const withoutObese = f.repro.filter(x => x !== "Obese");
      return { ...f, repro: v === "Obese" ? [...withoutObese, "Obese"] : withoutObese };
    });
    setErrors(e => ({ ...e, repro: "" }));
  }

  function handleKgChange(raw: string) {
    // Accept comma as a decimal separator (e.g. "4,5") in addition to a
    // period. The displayed/stored value keeps whatever the user actually
    // typed (comma stays a comma). The auto-computed lb value also uses
    // whichever separator was typed, so both fields stay visually
    // consistent instead of one using a comma and the other a period.
    const forCalc = raw.replace(",", ".");
    const kg = parseFloat(forCalc);
    const usesComma = raw.includes(",");
    let computedLb = "";
    if (raw && !isNaN(kg)) {
      computedLb = (kg / 0.453592).toFixed(2);
      if (usesComma) computedLb = computedLb.replace(".", ",");
    }
    setForm(f => ({
      ...f,
      weightKg: raw,
      weightLb: raw && !isNaN(kg) ? computedLb : f.weightLb,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  function handleLbChange(raw: string) {
    const forCalc = raw.replace(",", ".");
    const lb = parseFloat(forCalc);
    const usesComma = raw.includes(",");
    let computedKg = "";
    if (raw && !isNaN(lb)) {
      computedKg = (lb * 0.453592).toFixed(2);
      if (usesComma) computedKg = computedKg.replace(".", ",");
    }
    setForm(f => ({
      ...f,
      weightLb: raw,
      weightKg: raw && !isNaN(lb) ? computedKg : f.weightKg,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  const weightKgNum = parseFloat(form.weightKg) || null;
  const rer = weightKgNum && weightKgNum > 0 ? 70 * Math.pow(weightKgNum, 0.75) : null;

  const denIntact   = rer ? Math.round(rer * 1.4) : null;
  const denNeutered = rer ? Math.round(rer * 1.2) : null;
  const denObese    = rer ? Math.round(rer * 1.0) : null;

  // Obese always wins when multiple statuses are selected together.
  const activeDen = rer && form.repro.length > 0 ? Math.round(rer * getCatDenMultiplier(form.repro)) : null;

  function validate() {
    const e: Record<string, string> = {};
    if (!form.catName.trim()) e.catName = "Please enter your cat's name.";
    if (!form.age.trim()) e.age = "Please enter your cat's age.";
    if (!form.sex) e.sex = "Please select a sex.";
    if (!form.repro || form.repro.length === 0) e.repro = "Please select reproductive status.";
    if (!bodyConditionTouched) e.bodyCondition = "Please select body condition.";
    if (!form.weightKg || parseFloat(form.weightKg) <= 0) e.weightKg = "Please enter a valid body weight.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onNext(form, buildCatProfile(form));
  }

  return (
    <div className="border-[2px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ border: "2px solid #3C6293", borderRadius: "12px" }}>
      <CardHeader
        title="Cat Profile"
        eyebrow="Step 1 of 3"
      />
      <div className="bg-white grid grid-cols-1 md:grid-cols-2" style={{ padding: "32px", columnGap: "0px" }}>
        <div className="md:pr-8 md:border-r-[1.5px] md:border-[#3C6293]" style={{ paddingRight: "32px", borderRight: "1.5px solid #3C6293" }}>
          <SectionLabel>Basic Information</SectionLabel>
          <div className="space-y-4" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Field label="Cat Name *" error={errors.catName}>
              <input className={inputCls(!!errors.catName)} value={form.catName}
                onChange={e => set("catName", e.target.value)} placeholder="e.g. Luna" />
            </Field>
            <Field label="Breed">
              <input className={inputCls(false)} value={form.breed}
                onChange={e => set("breed", e.target.value)} placeholder="e.g. Persian" />
            </Field>
            <AgeYearMonthPicker
              years={ageYears}
              months={ageMonths}
              onYearsChange={v => updateAgeFromParts(v, ageMonths)}
              onMonthsChange={v => updateAgeFromParts(ageYears, v)}
            />
            <Field label="Age *" error={errors.age}>
              <input className={inputCls(!!errors.age, true)} value={form.age}
                readOnly
                style={{ cursor: "not-allowed", opacity: 0.75 }}
                placeholder="e.g. 3 years / 8 months" />
            </Field>
            <Field label="Sex *" error={errors.sex}>
              <PillGroup
                name="cat-sex" value={form.sex}
                options={[{ value: "M", label: "♂ Male" }, { value: "F", label: "♀ Female" }]}
                onChange={v => set("sex", v)}
              />
            </Field>
          </div>
        </div>

        <div className="md:pl-8 mt-8 md:mt-0" style={{ paddingLeft: "32px", marginTop: "0" }}>
          <SectionLabel>Reproductive Status</SectionLabel>
          <Field label="Reproductive Status *" error={errors.repro}>
            <PillGroup
              name="cat-repro-status"
              value={form.repro.find(x => x === "Intact" || x === "Neutered") ?? ""}
              options={[
                { value: "Intact", label: "Intact" },
                { value: "Neutered", label: "Neutered" },
              ]}
              onChange={v => setReproStatus(v as "Intact" | "Neutered" | "")}
            />
          </Field>

          <div className="mt-6" style={{ marginTop: "24px" }}>
            <SectionLabel>Body Weight</SectionLabel>

            <Field label="Body Condition *" error={errors.bodyCondition}>
              <PillGroup
                name="cat-body-condition"
                value={!bodyConditionTouched ? "" : form.repro.includes("Obese") ? "Obese" : "Normal"}
                options={[
                  { value: "Normal", label: "Normal" },
                  { value: "Obese", label: "Obese" },
                ]}
                onChange={v => setBodyCondition(v as "Normal" | "Obese" | "")}
              />
            </Field>

            <div className="grid grid-cols-2" style={{ gap: "16px", marginTop: "16px" }}>
              <Field label="Weight (kg) *" error={errors.weightKg}>
                <input type="text" inputMode="decimal"
                  className={inputCls(!!errors.weightKg, true)} value={form.weightKg}
                  onChange={e => handleKgChange(e.target.value)} placeholder="e.g. 4.5" />
              </Field>
              <Field label="Weight (lb)">
                <input type="text" inputMode="decimal"
                  className={inputCls(false, true)} value={form.weightLb}
                  onChange={e => handleLbChange(e.target.value)} placeholder="e.g. 9.9" />
              </Field>
            </div>

            {rer && form.repro.length > 0 && activeDen && (
              <div className="flex items-center justify-between gap-4" style={{ marginTop: "28px", background: "#E0F2FF", borderRadius: "14px", padding: "20px 24px" }}>
                <div>
                  <p className="font-bold uppercase tracking-wider" style={{ color: "#DE7100", fontSize: "18px" }}>Daily Energy Need</p>
                  <p className="font-semibold" style={{ color: "#DE7100", fontSize: "13px", marginTop: "4px" }}>{form.repro.join(" + ")} adult</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[40px] font-bold leading-none" style={{ color: "#143C6F" }}>{activeDen.toLocaleString()}</p>
                  <p className="font-semibold" style={{ color: "#DE7100", fontSize: "16px", marginTop: "6px" }}>kcal / day</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 flex gap-3" style={{ marginTop: "36px" }}>
          <button onClick={onBack} type="button"
            className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
            style={{
              fontFamily: "'Parastoo', sans-serif",
              fontWeight: 700,
              fontSize: "18px",
              padding: "18px 28px",
              borderRadius: "12px",
            }}
          >
            ← Back
          </button>
          <button onClick={submit}
            className="flex-1 bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
            style={{
              fontFamily: "'Parastoo', sans-serif",
              fontWeight: 700,
              fontSize: "18px",
              padding: "18px 24px",
              borderRadius: "12px",
              gap: "10px",
              letterSpacing: "0.02em",
            }}
          >
            Proceed to Ingredient Selection <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page 2: Ingredients ──────────────────────────────────────────────────────
function IngredientsPage({
  onBack,
  onCalculate,
  onIngredientsLoaded,
  apiBase,
  initialSelected = [],
  onSelectionChange,
  serverError,
  dietType,
  petType,
}: {
  onBack: () => void;
  onCalculate: (selected: string[]) => void;
  onIngredientsLoaded: (items: IngredientItem[]) => void;
  apiBase: string;
  initialSelected?: string[];
  onSelectionChange?: (selected: string[]) => void;
  serverError?: string;
  dietType?: DietType | null;
  petType?: PetType | null;
}) {
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loading, setLoading] = useState(!ingredientsResolvedCache[apiBase]);
  const [error, setError] = useState("");
  const [valError, setValError] = useState("");

  useEffect(() => {
    function applyFlat(flat: IngredientItem[]) {
      const cats: Record<string, CategoryMeta> = {};
      const ord: string[] = [];
      flat.forEach(({ ingredient_name, group_name }) => {
        if (!cats[group_name]) {
          cats[group_name] = { ...parseMeta(group_name), items: [], selected: [] };
          ord.push(group_name);
        }
        cats[group_name].items.push(ingredient_name);
      });
      // Any group_name not found in MAX_MAP falls back to max = 99 (see parseMeta),
      // which the card UI renders as "∞". Cap those at the real item count instead,
      // so a category never shows an infinite max just because it's missing from
      // the hardcoded MAX_MAP table (e.g. Mineral Group A / B).
      Object.keys(cats).forEach(gn => {
        if (cats[gn].max === 99) {
          cats[gn].max = cats[gn].items.length;
        }
      });
      // Restore previously selected ingredients
      const restoredSelected = new Set(initialSelected);
      restoredSelected.forEach(name => {
        const key = Object.keys(cats).find(gn => cats[gn].items.includes(name));
        if (key) cats[key].selected = [...(cats[key].selected ?? []), name];
      });
      // Sort by the leading numeric prefix in group_name (e.g. "01 Meat Group A" → 1),
      // so categories always appear in the correct sequence regardless of API order
      ord.sort((a, b) => {
        const numA = parseInt(a.match(/^\d+/)?.[0] ?? "999", 10);
        const numB = parseInt(b.match(/^\d+/)?.[0] ?? "999", 10);
        return numA - numB;
      });
      setCategories(cats);
      setOrder(ord);
      setSelected(restoredSelected);
      setLoading(false);
      onIngredientsLoaded(flat);
    }

    // If a prefetch (kicked off earlier, when the diet type was chosen)
    // already resolved, use it immediately — no network wait, no flash.
    const cached = ingredientsResolvedCache[apiBase];
    if (cached) {
      applyFlat(cached);
      return;
    }

    // Otherwise reuse the same shared in-flight request instead of firing
    // a brand new one — this still applies even if the prefetch hasn't
    // finished yet, so there's never a duplicate fetch to the same URL.
    prefetchIngredients(apiBase)
      .then(applyFlat)
      .catch(e => {
        setError(`Could not load ingredients: ${e.message}. Is your FastAPI server running at ${apiBase}?`);
        setLoading(false);
      });
  }, [apiBase]);

  function toggle(name: string, gn: string) {
    const cat = categories[gn];
    const newCats = { ...categories };
    const newSel = new Set(selected);

    if (newSel.has(name)) {
      newSel.delete(name);
      newCats[gn] = { ...cat, selected: cat.selected.filter(n => n !== name) };
    } else {
      if (cat.selected.length >= cat.max) return;
      newSel.add(name);
      newCats[gn] = { ...cat, selected: [...cat.selected, name] };
    }
    setCategories(newCats);
    setSelected(newSel);
    setValError("");
    onSelectionChange?.([...newSel]);
  }

  function toggleAll(gn: string) {
    const cat = categories[gn];
    const newCats = { ...categories };
    const newSel = new Set(selected);
    const allSelected = cat.items.every(n => newSel.has(n));

    if (allSelected) {
      // Deselect all items in this category
      cat.items.forEach(n => newSel.delete(n));
      newCats[gn] = { ...cat, selected: [] };
    } else {
      // Select all items in this category (respecting max)
      const toAdd = cat.items.filter(n => !newSel.has(n));
      let remaining = cat.max - cat.selected.length;
      for (const n of toAdd) {
        if (remaining <= 0) break;
        newSel.add(n);
        remaining--;
      }
      newCats[gn] = { ...cat, selected: cat.items.filter(n => newSel.has(n)) };
    }
    setCategories(newCats);
    setSelected(newSel);
    setValError("");
    onSelectionChange?.([...newSel]);
  }

  function submit() {
    const missing = [...new Set(
      Object.values(categories)
        .filter(c => c.mandatory && c.selected.length === 0)
        .map(c => displayLabelFor(c.clean, dietType))
    )];
    if (missing.length > 0) {
      setValError(`Please select at least one item from: ${missing.join(", ")}`);
      return;
    }
    const vegAEntry = Object.entries(categories).find(([k]) => /vegetable a/i.test(k));
    const vegBEntry = Object.entries(categories).find(([k]) => /vegetable b/i.test(k));
    if (vegAEntry && vegBEntry) {
      const vegA = vegAEntry[1].selected.length;
      const vegB = vegBEntry[1].selected.length;
      if (vegA + vegB < 2) {
        setValError("Please select at least 2 vegetables");
        return;
      }
    }
    onCalculate([...selected]);
  }

  return (
    <div className="border-[2px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ border: "2px solid #3C6293", borderRadius: "12px" }}>
      <CardHeader
        eyebrow="Step 2 of 3"
        title="Select Ingredients"
        desc="Choose ingredients for the diet. Mandatory categories must have at least one selection."
      />
      <div className="bg-white" style={{ padding: "32px" }}>
        {error && (
          <div className="bg-[#FDEBEC] border-[1.5px] border-[#B02424] rounded-[12px] text-[#AD0B39] font-bold text-[14px]" style={{ padding: "18px 20px", marginTop: "8px", marginBottom: "24px" }}>
            ❌ {error}
          </div>
        )}
        {serverError && (
          <div className="bg-[#FDEBEC] border-[1.5px] border-[#B02424] rounded-[12px] text-[#AD0B39] font-bold text-[14px]" style={{ padding: "18px 20px", marginTop: "8px", marginBottom: "24px" }}>
            ❌ {serverError}
          </div>
        )}


        {loading ? (
          <div className="text-center py-16 text-[#3C6293] italic">⏳ Loading ingredients from server…</div>
        ) : (
          <>
            {/* Group categories under super-group headings (Meat, Grain, etc.) */}
            {(() => {
              const groups: { superGroup: string; gns: string[] }[] = [];
              order.forEach(gn => {
                const sg = superGroupOf(categories[gn].clean);
                let bucket = groups.find(g => g.superGroup === sg);
                if (!bucket) { bucket = { superGroup: sg, gns: [] }; groups.push(bucket); }
                bucket.gns.push(gn);
              });
              // Within each super-group, always show Mandatory boxes before Optional ones,
              // regardless of the numeric prefix order in the source data
              groups.forEach(bucket => {
                bucket.gns.sort((a, b) => {
                  const aMand = categories[a].mandatory ? 0 : 1;
                  const bMand = categories[b].mandatory ? 0 : 1;
                  return aMand - bMand;
                });
              });
              return groups.map(({ superGroup, gns }) => (
                <div key={superGroup} className="mb-8" style={{ marginBottom: "40px" }}>
                  <h3
                    className="text-[#143C6F] mb-4"
                    style={{ fontFamily: "'Marcellus', serif", fontSize: "30px", fontWeight: 700, marginBottom: (superGroup === "Vegetable" && !(petType === "cat" && dietType === "raw")) ? "6px" : "20px" }}
                  >
                    {superGroup === "Grain"
                      ? (dietType === "grainfree" ? "Carbohydrate (Non-Grain)" : "Carbohydrate (Grain)")
                      : superGroup}
                  </h3>
                  {superGroup === "Vegetable" && !(petType === "cat" && dietType === "raw") && (
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#D97F1B",
                        marginBottom: "16px",
                        letterSpacing: "0.01em",
                      }}
                    >
                      * Select at least 2 vegetables total, from either card below.
                    </p>
                  )}
                  <div className="flex flex-col" style={{ gap: "20px" }}>
                    {gns.map(gn => {
                      const cat = categories[gn];
                      const maxLabel = cat.max === 99 ? "∞" : cat.max;
                      const color = cat.mandatory ? "#143C6F" : "#FA9A36";
                      const chipBg = cat.mandatory ? "#BEE2FB" : "#FFDCB7";
                      const subLabel = subLabelOf(cat.clean, superGroup);
                      const displaySubLabel =
                        superGroup === "Meat" && subLabel
                          ? `Meat ${subLabel.replace("Group", "Type")}`
                          : superGroup === "Mineral" && subLabel
                          ? `Mineral ${subLabel}`
                          : null;
                      return (
                        <div
                          key={gn}
                          className="flex"
                          style={{ border: `2px solid ${color}`, borderRadius: "16px", background: "#fff", position: "relative" }}
                        >
                          <div
                            className="shrink-0 flex flex-col justify-between items-center text-white"
                            style={{
                              width: "180px",
                              padding: "14px 16px",
                              background: color,
                              position: "relative",
                              zIndex: 2,
                              borderRadius: "14px 0 0 14px",
                              gap: "10px",
                              textAlign: "center",
                            }}
                          >
                            {/* Reliable CSS-triangle arrow (border trick), not clip-path */}
                            <div
                              style={{
                                position: "absolute",
                                right: "-16px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                width: 0,
                                height: 0,
                                borderTop: "16px solid transparent",
                                borderBottom: "16px solid transparent",
                                borderLeft: `16px solid ${color}`,
                                zIndex: 3,
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: 0,
                                right: 0,
                                transform: "translateY(-50%)",
                                textAlign: "center",
                                padding: "0 16px",
                              }}
                            >
                              <p className="text-[21px] font-bold leading-tight">{cat.mandatory ? "Mandatory" : "Optional"}</p>
                              {displaySubLabel && (
                                <p
                                  className="text-[14px] font-semibold"
                                  style={{ marginTop: "4px", color: cat.mandatory ? "#E0C39B" : "#800000" }}
                                >
                                  {displaySubLabel}
                                </p>
                              )}
                            </div>
                            {superGroup !== "Mineral" && (
                              <p
                                className="text-[16px] font-bold"
                                style={{ color: cat.mandatory ? "#FF9D36" : "#143C6F", textAlign: "center", marginTop: "auto" }}
                              >
                                {cat.mandatory ? `Min: 1, Max: ${maxLabel}` : `Max: ${maxLabel}`}
                              </p>
                            )}
                          </div>
                          <div
                            className="flex-1"
                            style={{
                              position: "relative",
                              zIndex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "14px",
                              padding: "16px 16px 16px 28px",
                              borderRadius: "0 14px 14px 0",
                              background: "#fff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                                justifyContent: "center",
                                gap: "12px",
                                width: "100%",
                              }}
                            >
                              {cat.items.map(name => {
                                const isSel = selected.has(name);
                                const displayName = formatIngredientName(name);
                                // Any ingredient name too long to fit on one line gets to
                                // wrap to 2 lines instead of being truncated/cut off — but
                                // only that pill grows; alignItems:"flex-start" above keeps
                                // it from stretching its row-siblings.
                                const allowWrap = displayName.length > 24;
                                // Detect "brewer's yeast / dried yeast" by its WORDS, not by
                                // searching for a slash character — two earlier attempts to
                                // match the separator character both failed, which points to
                                // the backend using a non-standard slash-like character here
                                // rather than a plain "/". Matching on the words themselves
                                // can't fail the same way. Split right before "dried" so line
                                // 1 keeps everything up to it (e.g. "brewer's yeast /") and
                                // line 2 is "dried yeast" — preserving the real text/casing.
                                const isBrewersYeast =
                                  /brewer/i.test(displayName) &&
                                  /yeast/i.test(displayName) &&
                                  /dried/i.test(displayName);
                                const driedSplit = isBrewersYeast
                                  ? displayName.match(/^(.*?)\s*(\bdried\b.*)$/i)
                                  : null;
                                return (
                                  <button key={name} type="button" onClick={() => toggle(name, gn)}
                                    className="text-[15px] font-extrabold transition-all"
                                    style={{
                                      flex: "0 0 calc(33.333% - 8px)",
                                      padding: "14px 16px",
                                      background: isSel ? color : chipBg,
                                      color: isSel ? "#fff" : "#211915",
                                      textAlign: "center",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      boxSizing: "border-box",
                                      lineHeight: 1.2,
                                      borderRadius: "24px",
                                      whiteSpace: allowWrap ? "normal" : "nowrap",
                                      overflow: allowWrap ? "visible" : "hidden",
                                      textOverflow: allowWrap ? "clip" : "ellipsis",
                                    }}
                                  >
                                    {driedSplit ? (
                                      <>
                                        {driedSplit[1]}
                                        <br />
                                        {driedSplit[2]}
                                      </>
                                    ) : (
                                      displayName
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {cat.items.length === 2 && (
                              <button
                                type="button"
                                onClick={() => toggleAll(gn)}
                                className="text-[15px] font-extrabold transition-all"
                                style={{
                                  width: "calc(33.333% - 8px)",
                                  padding: "14px 18px",
                                  background: "transparent",
                                  border: `1.5px solid ${color}`,
                                  color: color,
                                  boxSizing: "border-box",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  lineHeight: 1.2,
                                  borderRadius: "24px",
                                }}
                              >
                                {cat.items.every(n => selected.has(n)) ? "✓ Both Selected" : "Select Both"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}

            <div className="flex gap-3" style={{ marginTop: "36px" }}>
              <button
                onClick={onBack}
                className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                  padding: "18px 28px",
                  borderRadius: "12px",
                }}
              >
                ← Back to Profile
              </button>
              <button
                onClick={submit}
                className="flex-1 bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                  padding: "18px 24px",
                  borderRadius: "12px",
                  gap: "10px",
                  letterSpacing: "0.02em",
                }}
              >
                Calculate Diet <span>→</span>
              </button>
            </div>
            {valError && (
              <div
                className="bg-[#FDEBEC] border-[1.5px] border-[#B02424] rounded-[12px] text-[#AD0B39] font-bold text-center"
                style={{ padding: "24px 28px", fontSize: "20px", lineHeight: 1.5, marginTop: "24px" }}
              >
                ❌ {valError}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page 3: Results ──────────────────────────────────────────────────────────
function ResultsPage({
  profile,
  result,
  selectedIngredients,
  allIngredients,
  onBack,
  onGoHome,
  onReset,
  petType,
  dietType,
  initialFeedPlanUnlocked,
}: {
  profile: ReturnType<typeof buildProfile> | ReturnType<typeof buildCatProfile>;
  result: CalcResult | null;
  selectedIngredients: string[];
  allIngredients: IngredientItem[];
  onBack: () => void;
  onGoHome?: () => void;
  onReset: () => void;
  petType: PetType;
  dietType: DietType;
  initialFeedPlanUnlocked?: boolean;
}) {
  const [feedPlanUnlocked, setFeedPlanUnlocked] = useState(!!initialFeedPlanUnlocked);
  const [reportEmail, setReportEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail);

  // Same per-pet/diet backend selection used by handleCalculate — the email
  // endpoint lives on the same backend as /calculate.
  const emailApiBase = API_BASES[`${petType}_${dietType}`] ?? "http://localhost:8000";

  async function sendReportEmail() {
    if (!isValidEmail || emailSending || emailSent || !result) return;
    setEmailSending(true);
    setEmailError("");

    // Grab the exact same markup that window.print() renders (the
    // .print-only block + its scoped <style>), so the PDF the backend builds
    // is identical to what "Print / Save" produces — not a re-derived summary.
    const printEl = document.querySelector(".print-only");
    const printStyles = document.getElementById("print-report-styles");
    if (!printEl || !printStyles) {
      setEmailError("Couldn't find the report to send — please try again.");
      setEmailSending(false);
      return;
    }

    const reportHtml =
      `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
      `<style>${printStyles.innerHTML}</style>` +
      // The site's own CSS hides .print-only by default (it only shows
      // during an actual browser print, via @media print). An email
      // client never triggers that, so without this override the report
      // would render as a blank email — this forces it visible here,
      // specifically for the copy that gets emailed.
      `<style>.print-only { display: block !important; }</style></head>` +
      `<body>${printEl.outerHTML}</body></html>`;

    const payload = {
      recipient_email: reportEmail,
      patient_name: profile.dogName || (profile as any).catName || "Your Pet",
      report_html: reportHtml,
    };

    try {
      const res = await fetch(`${emailApiBase}/report/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEmailSent(true);
    } catch (e: unknown) {
      setEmailError("Couldn't send the email — please try again.");
    } finally {
      setEmailSending(false);
    }
  }

  // Shuffle fixed ingredients — reshuffles every time the ingredients tab is opened
  const [shuffledFixed, setShuffledFixed] = useState<BreakdownRow[]>(() =>
    result ? [...(result.dm_breakdown ?? []).filter(r => r.fixed)].sort(() => Math.random() - 0.5) : []
  );

  // Shuffle the full fresh-weight batch table — reshuffles every time the report is (re)opened.
  // Each row keeps its ingredient, unit, and all day-columns bundled together (they're computed
  // from the same row object), so shuffling order can never mismatch a name with the wrong numbers.
  const [shuffledBreakdown, setShuffledBreakdown] = useState<BreakdownRow[]>(() =>
    result ? [...(result.dm_breakdown ?? [])].sort(() => Math.random() - 0.5) : []
  );

  useEffect(() => {
    if (result) {
      setShuffledFixed([...(result.dm_breakdown ?? []).filter(r => r.fixed)].sort(() => Math.random() - 0.5));
      setShuffledBreakdown([...(result.dm_breakdown ?? [])].sort(() => Math.random() - 0.5));
    }
  }, [result]);

  if (!result) {
    return (
      <div style={{ border: "2px solid #3C6293", borderRadius: "13px 13px 0 0", overflow: "hidden" }}>
        <CardHeader eyebrow="Step 3 of 3" title="Diet Report" desc="Calculating your diet…" />
        <div className="bg-white rounded-b-[16px] p-8 text-center py-16">
          <div className="w-11 h-11 border-[3px] border-[#A6CCE8] border-t-[#FFB160] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#3C6293] italic">Calculating diet for <strong>{profile.dogName}</strong>…</p>
        </div>
      </div>
    );
  }

  const breakdown = result.dm_breakdown || [];
  const totalDM = breakdown.reduce((s, r) => s + Number(r.dm_g), 0);
  const totalFresh = breakdown.reduce((s, r) => s + Number(r.fresh_weight_g), 0);

  function cleanIngredientName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("eggshell")) return formatIngredientName("Eggshells / Calcium Carbonate");
    if (lower.includes("oyster")) return formatIngredientName("Oyster");
    return formatIngredientName(name);
  }

  const r = result as unknown as Record<string, number | null>;

  // Calorie % from energy (pie chart formula)
  const energy = result.Energy ?? 0;
  const proteinCalPct = energy > 0 ? ((4 * (result.Protein_percent ?? 0)) / energy) * 1000 : null;
  const fatCalPct     = energy > 0 ? ((9 * (result.Fat_percent     ?? 0)) / energy) * 1000 : null;
  const choCalPct     = energy > 0 ? ((4 * (result.CHO_percent     ?? 0)) / energy) * 1000 : null;

  // Macro pie chart slices — brand colors (orange / navy / light blue)
  const macroPieSlices = [
    { label: "Protein", value: proteinCalPct ?? 0, color: "#FA9A36" },
    { label: "Fat",     value: fatCalPct     ?? 0, color: "#143C6F" },
    { label: "CHO",     value: choCalPct     ?? 0, color: "#A6CCE8" },
  ];
  const macroPieTotal = macroPieSlices.reduce((s, d) => s + d.value, 0);

  function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }
  function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarPoint(cx, cy, radius, endAngle);
    const end = polarPoint(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  }
  let macroPieCumAngle = 0;
  const macroPieArcs = macroPieSlices.map(slice => {
    const fraction = macroPieTotal > 0 ? slice.value / macroPieTotal : 0;
    const startAngle = macroPieCumAngle;
    const endAngle = macroPieCumAngle + fraction * 360;
    macroPieCumAngle = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const labelPoint = polarPoint(110, 110, 68, midAngle);
    return { ...slice, path: pieSlicePath(110, 110, 100, startAngle, endAngle), labelPoint, fraction };
  });

  // Per 1000 Kcal DM calculator — all nutrients use (val / Energy) * 1000
  // (matches the clone's calculation exactly). perKcal: null = no calc.
  function calcPerKcal(val: number | null, formula: "x1000" | null): number | null {
    if (formula === null || val == null || energy <= 0) return null;
    return (val / energy) * 1000;
  }

  // Unified table sections
  // perKcal: "x1000" for all nutrient rows, null for no calc
  const aafco = (result as any).aafco_percent_of_minimum ?? {};

  const unifiedSections = [
    { cat: "Proximates", rows: [
      { label: "ME (kcal/kg)",       unit: "kcal/kg DM", val: result.Energy,          min: null, dec: 0, perKcal: null as null },
      { label: "Crude protein",      unit: "% DM",       val: result.Protein_percent, min: petType === "cat" ? 26 : 18,  dec: 2, aafcoPct: aafco["Protein"], perKcal: "x1000" as const },
      { label: "Crude fat",          unit: "% DM",       val: result.Fat_percent,     min: petType === "cat" ? 9  : 5.5, dec: 2, aafcoPct: aafco["Fat"], perKcal: "x1000" as const },
      { label: "Crude fiber",        unit: "% DM",       val: result.Fiber_percent,   min: null, dec: 2, perKcal: "x1000" as const },
      { label: "Ash",                unit: "% DM",       val: r["Ash_percent"] ?? null, min: null, dec: 2, perKcal: "x1000" as const },
      { label: "Carbohydrates",      unit: "% DM",       val: result.CHO_percent,     min: null, dec: 2, perKcal: "x1000" as const },
    ]},
    { cat: "Amino Acids", rows: [
      { label: "Arginine",       unit: "% DM", val: r["arginine_percent"] ?? null,      min: petType === "cat" ? 1.04 : 0.51, dec: 2, aafcoPct: aafco["Arginine"], perKcal: "x1000" as const },
      { label: "Isoleucine",     unit: "% DM", val: r["isoleucine_percent"] ?? null,    min: petType === "cat" ? 0.52 : 0.38, dec: 2, aafcoPct: aafco["Isoleucine"], perKcal: "x1000" as const },
      { label: "Leucine",        unit: "% DM", val: r["leucine_percent"] ?? null,       min: petType === "cat" ? 1.24 : 0.68, dec: 2, aafcoPct: aafco["Leucine"], perKcal: "x1000" as const },
      { label: "Lysine",         unit: "% DM", val: r["lysine_percent"] ?? null,        min: petType === "cat" ? 0.83 : 0.63, dec: 2, aafcoPct: aafco["Lysine"], perKcal: "x1000" as const },
      { label: "Methionine",     unit: "% DM", val: r["methionine_percent"] ?? null,    min: petType === "cat" ? 0.2  : 0.33, dec: 2, aafcoPct: aafco["Methionine"], perKcal: "x1000" as const },
      { label: "Phenylalanine",  unit: "% DM", val: r["phenylalanine_percent"] ?? null, min: petType === "cat" ? 0.42 : 0.45, dec: 2, aafcoPct: aafco["Phenylalanine"], perKcal: "x1000" as const },
      { label: "Threonine",      unit: "% DM", val: r["threonine_percent"] ?? null,     min: petType === "cat" ? 0.73 : 0.48, dec: 2, aafcoPct: aafco["Threonine"], perKcal: "x1000" as const },
      { label: "Tryptophan",     unit: "% DM", val: r["tryptophan_percent"] ?? null,    min: petType === "cat" ? 0.16 : 0.16, dec: 2, aafcoPct: aafco["Tryptophan"], perKcal: "x1000" as const },
      { label: "Tyrosine",       unit: "% DM", val: r["tyrosine_percent"] ?? null,      min: petType === "cat" ? 0.2  : 0.18, dec: 2, aafcoPct: aafco["Tyrosine"], perKcal: "x1000" as const },
      { label: "Valine",         unit: "% DM", val: r["valine_percent"] ?? null,        min: petType === "cat" ? 0.2  : 0.49, dec: 2, aafcoPct: aafco["Valine"], perKcal: "x1000" as const },
    ]},
    { cat: "Fatty Acids", rows: [
      { label: "EPA",                                  unit: "% DM", val: r["epa_percent"] ?? null,      min: petType === "cat" ? 0.01 : 0.05, dec: 3, aafcoPct: aafco["EPA"], perKcal: "x1000" as const },
      { label: "DHA",                                  unit: "% DM", val: r["dha_percent"] ?? null,      min: petType === "cat" ? 0.01 : 0.05, dec: 3, aafcoPct: aafco["DHA"], perKcal: "x1000" as const },
      { label: "Omega-6",   unit: "% DM", val: r["linoleic_percent"] ?? null, min: petType === "cat" ? 0.6  : 1.3,  dec: 3, aafcoPct: aafco["FA_18_2"], perKcal: "x1000" as const },
      { label: "Omega-3",   unit: "% DM", val: r["ala_percent"] ?? null,      min: petType === "cat" ? 0.1  : 0.08, dec: 3, aafcoPct: aafco["FA_18_3"], perKcal: "x1000" as const },
    ]},
    { cat: "Minerals", rows: [
      { label: "Calcium (Ca)",    unit: "% DM",     val: result.Ca_percent,       min: petType === "cat" ? 0.6  : 0.6,  dec: 2, aafcoPct: aafco["Ca"], perKcal: "x1000" as const },
      { label: "Phosphorus (P)",  unit: "% DM",     val: result.P_percent,        min: petType === "cat" ? 0.5  : 0.4,  dec: 2, aafcoPct: aafco["P"], perKcal: "x1000" as const },
      { label: "Potassium (K)",   unit: "% DM",     val: r["K_percent"] ?? null,  min: petType === "cat" ? 0.6  : 0.6,  dec: 2, aafcoPct: aafco["K"], perKcal: "x1000" as const },
      { label: "Sodium (Na)",     unit: "% DM",     val: r["Na_percent"] ?? null, min: petType === "cat" ? 0.2  : 0.08, dec: 2, aafcoPct: aafco["Na"], perKcal: "x1000" as const },
      { label: "Magnesium (Mg)",  unit: "% DM",     val: r["Mg_percent"] ?? null, min: petType === "cat" ? 0.04 : 0.06, dec: 3, aafcoPct: aafco["Mg"], perKcal: "x1000" as const },
      { label: "Iron (Fe)",       unit: "mg/kg DM", val: result.iron_mg,          min: petType === "cat" ? 80   : 40,   dec: 2, aafcoPct: aafco["Iron"], perKcal: "x1000" as const },
      { label: "Copper (Cu)",     unit: "mg/kg DM", val: r["cu_mg_kg"] ?? null,   min: petType === "cat" ? 5    : 7.3,  dec: 2, aafcoPct: aafco["Cu"], perKcal: "x1000" as const },
      { label: "Zinc (Zn)",       unit: "mg/kg DM", val: r["zn_mg_kg"] ?? null,   min: petType === "cat" ? 75   : 80,   dec: 2, aafcoPct: aafco["Zn"], perKcal: "x1000" as const },
      { label: "Iodine (I)",      unit: "mg/kg DM", val: r["iodine_mg_kg"] ?? null, min: petType === "cat" ? 0.6  : 1.5,  dec: 2, aafcoPct: aafco["Iodine"], perKcal: "x1000" as const },
      { label: "Selenium (Se)",   unit: "mg/kg DM", val: r["se_mg_kg"] ?? null,   min: petType === "cat" ? 0.3  : 0.35, dec: 2, aafcoPct: aafco["Se"], perKcal: "x1000" as const },
    ]},
    { cat: "Vitamins", rows: [
      { label: "Vitamin A",             unit: "IU/kg DM", val: r["vitamin_a_iu_kg"] ?? null,        min: petType === "cat" ? 3332  : 5000,  dec: 0, aafcoPct: aafco["Vitamin_A"], perKcal: "x1000" as const },
      { label: "Vitamin D",             unit: "IU/kg DM", val: r["vitamin_d_iu_kg"] ?? null,        min: petType === "cat" ? 280   : 500,   dec: 0, aafcoPct: aafco["Vitamin_D"], perKcal: "x1000" as const },
      { label: "Vitamin E",             unit: "mg/kg DM", val: r["vitamin_e_iu_kg"] ?? null,        min: petType === "cat" ? 28    : 45,    dec: 1, aafcoPct: aafco["Vitamin_E"], perKcal: "x1000" as const },
      { label: "Thiamine (B1)",         unit: "mg/kg DM", val: r["thiamin_mg_kg"] ?? null,          min: petType === "cat" ? 4.6   : 2.25,  dec: 2, aafcoPct: aafco["Thiamin"], perKcal: "x1000" as const },
      { label: "Riboflavin (B2)",       unit: "mg/kg DM", val: r["riboflavin_mg_kg"] ?? null,       min: petType === "cat" ? 4     : 5.2,   dec: 2, aafcoPct: aafco["Riboflavin"], perKcal: "x1000" as const },
      { label: "Niacin (B3)",           unit: "mg/kg DM", val: r["niacin_mg_kg"] ?? null,           min: petType === "cat" ? 60    : 13.6,  dec: 2, aafcoPct: aafco["Niacin"], perKcal: "x1000" as const },
      { label: "Pantothenic acid (B5)", unit: "mg/kg DM", val: r["pantothenic_acid_mg_kg"] ?? null, min: petType === "cat" ? 0.216 : 12.0,  dec: 2, aafcoPct: aafco["Pantothenic_acid"], perKcal: "x1000" as const },
      { label: "Folic acid",            unit: "mg/kg DM", val: r["folate_mg_kg"] ?? null,           min: petType === "cat" ? 0.8   : 0.216, dec: 3, aafcoPct: aafco["Folate"], perKcal: "x1000" as const },
      { label: "Cobalamin (B12)",       unit: "mg/kg DM", val: r["b12_mg_kg"] ?? null,              min: petType === "cat" ? 0.02  : 0.02,  dec: 3, aafcoPct: aafco["B12"], perKcal: "x1000" as const },
    ]},
  ];

  // Daily feeding plan calc
  const dogE    = profile.den;
  const dietE   = result ? Math.round(result.Energy) : 0;
  const dailyDM = dogE > 0 && dietE > 0 ? (dogE / dietE) * 1000 : null;
  const pctBatch = dailyDM && totalDM > 0 ? (dailyDM / totalDM) * 100 : null;
  const DAYS = [1, 3, 5, 7, 10, 15, 20, 25, 30];

  return (
    <div style={{ border: "2px solid #3C6293", borderRadius: "13px 13px 0 0", overflow: "hidden" }}>
      <CardHeader
        eyebrow="Step 3 of 3"
        title="Diet Report"
        desc={`Nutritional analysis based on your ${petType}'s profile and selected ingredients.`}
      />
      <div className="bg-white" style={{ padding: "32px" }}>

        {/* ─── Print styles ─────────────────────────────────────────────
            Keeps .print-only content out of normal browsing entirely.
            It only exists in the DOM (so window.print() can render it)
            but is display:none until a print/PDF context is active. */}
        <style id="print-report-styles">{`
          .print-only {
            display: none;
          }
          @media print {
            @page {
              size: landscape;
              margin: 12mm;
            }
            body > *:not(.print-only) { display: none !important; }
            .print-only {
              display: block !important;
            }
            .print-only, .print-only * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-watermark {
              position: fixed;
              top: 0; left: 0; right: 0; bottom: 0;
              pointer-events: none;
              z-index: 9999;
              opacity: 0.08;
              background-repeat: repeat;
              background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iMjYwIiB2aWV3Qm94PSIwIDAgNDIwIDI2MCI+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIxMC4wLDEzMC4wKSByb3RhdGUoLTMwKSBzY2FsZSgwLjQyKSB0cmFuc2xhdGUoLTMxNy4wLC05My41KSI+CjxwYXRoIGQ9Ik03MC40ODk4IDE0Mi41QzYyLjExODcgMTU0LjIyNyA0Ni4wODMzIDE0MC43MDUgMzcuNTkwNSAxNDUuMjE2QzM1LjA3NjMgMTQ2LjU0OCAzNC4xODk5IDE1MC4xNTYgMzUuMTA1MiAxNTIuODU0TDM5LjIxMjYgMTY0Ljk2M0M0MS44MjUzIDE3Mi42NTQgMzcuNzIzNyAxNzkuODQxIDMwLjA4MjYgMTgyLjM3MUMyMy4wNzg3IDE4NC42OTQgMTUuMzQ0OCAxODQuNDM5IDguNDI3NzkgMTgxLjYxM0MtMS43NjgxNSAxNzcuNDQ5IC0wLjc1NDM1MiAxNjcuNDM2IDEuNDUyODQgMTU3LjcwN0M0Ljg2NSAxNDIuNjc0IDUuNDc5MDggMTI3LjY0IDIuOTI0MyAxMTIuNDE1TDAuMjUzNjYgOTYuNTQyM0MtMS4xMDc3MyA4OC40NDY0IDMuMzM1NjEgNzkuOTc5OCAxMS42ODkzIDc3LjI5ODVDMjkuMzU4NCA3MS42MTc1IDU5LjIxMDUgNjguMzI4MiA3Ni41MDMxIDc0LjEzMDlDODEuMDUwNyA3NS42NTM5IDg0LjQ4MDMgNzguODkxMSA4Ni4yMDY2IDgzLjM2MThDOTAuMDQ3NSA5My4zMTA4IDg2LjQyNjggMTA2LjkwMiA3Ny4zODk0IDEwOS4wOEM2Ny45MTE4IDExMS4zNjEgNTkuNzQzNSAxMDAuNzk5IDQzLjI0NDYgMTAxLjYyMUM0MC4yNjY5IDEwMS43NzIgMzcuMTA5NyAxMDIuNjI5IDM1LjM5NDkgMTA1LjE4OEMzMi43NTkgMTA5LjEyNiAzMi43NzA2IDExNC43MjYgMzUuNTU3MSAxMTguNjM1QzM4Ljk5MjUgMTIzLjQ0NyA0OS43NzkzIDEyMC43ODkgNTcuMTE5MiAxMTkuMTk3QzYxLjE4NiAxMTguMzE3IDY1LjAwOTUgMTE4LjczMyA2OC40MTU5IDEyMS4yNDdDNzQuNzQ3OCAxMjUuOTI2IDc1LjI0NiAxMzUuODQ2IDcwLjQ4NCAxNDIuNTA2TDcwLjQ4OTggMTQyLjVaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0xNTIuMjgzIDEwOC43NDRDMTU3LjQ4IDExMC43MzYgMTYwLjY0OSAxMTUuNzE2IDE1OS41NjUgMTIxLjIyNEwxNTYuMzY3IDEzNy40NzNDMTU0LjY4NyAxNDYuMDI3IDE1Ny4wNTEgMTUzLjgzOSAxNjEuOTY0IDE2MC42OUMxNjUuMDI4IDE2NC45NjMgMTY0LjUwMSAxNzAuODAxIDE2Mi4xMTQgMTc1LjM5M0MxNTkuOTg4IDE3OS40ODcgMTU1Ljc1OSAxODIuNDI5IDE1MC43NDIgMTgzLjQyNUMxNDMuMDkgMTg0Ljk0MiAxMzYuMTY3IDE4MC45NyAxMzMuNzY4IDE3My4xNjNDMTI5LjM3NyAxNzguMjEzIDEyNC4yNjIgMTgyLjIzMiAxMTcuNzkxIDE4My43NTVDMTA2LjM3MyAxODYuNDQyIDk1LjAxMjIgMTgxLjM2NCA4OS43NTc5IDE3MC45MjhDODIuMjAzNiAxNTUuOTI5IDgzLjIyOSAxMzMuMTc2IDg4LjIwNTMgMTE3LjA1NEM5MC4zMTk4IDExMC4yMTUgOTYuMTQ3NyAxMDYuMjY1IDEwMy4yMTUgMTA2LjY2NUMxMDguMDcgMTA2Ljk0MyAxMTIuNzM5IDEwOC45NjQgMTE1LjA1MSAxMTMuMzc3QzExOS43NDkgMTIyLjM0MSAxMDguMjk2IDEzOC45NTYgMTE0LjUzNSAxNTIuNzVDMTE1LjM4MSAxNTQuNjIxIDExNy4yMDYgMTU2LjI4MyAxMTguNjc3IDE1Ni43MDVDMTIyLjg0MyAxNTcuODkzIDEyNi42MzEgMTU0Ljk4NSAxMjguNDM5IDE1MC41MDlDMTMwLjM5NyAxNDUuNjYyIDEzMC41MDEgMTQwLjcwNSAxMjkuOTM5IDEzNS40ODdDMTI4Ljg3MyAxMjUuNjI1IDEyNy42NTcgMTEzLjE5MSAxMzYuNTMyIDEwOC45NThDMTQxLjQ5MSAxMDYuNTk1IDE0Ni45MTkgMTA2LjY3NiAxNTIuMjcyIDEwOC43MjZMMTUyLjI4MyAxMDguNzQ0WiIgZmlsbD0iI0Y3OTQxRCIvPgo8cGF0aCBkPSJNMzkzLjMyNSAxMDkuOTgzQzM5Ny40MzggMTEyLjQ1NiAzOTkuMDQ4IDExNy4yMjIgMzk4LjI4OSAxMjEuNjUyTDM5NS40NzQgMTM4LjA3QzM5NC4wODkgMTQ2LjEyNSAzOTYuMjczIDE1My41NDMgNDAwLjg3OSAxNjAuMDkzQzQwNC4wMTMgMTY0LjU0MSA0MDMuOTMyIDE3MC42NjIgNDAxLjM4OSAxNzUuNDQ1QzM5OS4wNTQgMTc5LjgyOSAzOTQuNDQ5IDE4Mi45NzQgMzg5LjA0NCAxODMuNTdDMzgxLjkwNiAxODQuMzU4IDM3NS44NjQgMTgwLjI4MSAzNzMuNzg0IDE3My4xMTFDMzYzLjczOSAxODUuOCAzNDYuMjAzIDE4OC42MTQgMzM0Ljk2NSAxNzcuNzIxQzMzMC41MzMgMTczLjQyNCAzMjguMTY5IDE2Ny41MDYgMzI2Ljc2NyAxNjEuMzY3QzMyMy40MDcgMTQ2LjY0NiAzMjQuNTAyIDEzMS40MTYgMzI5LjA1IDExNy4xMTJDMzMxLjY4IDEwOC44MzEgMzQwLjA3NCAxMDUuMDkgMzQ4LjA4IDEwNy44MzVDMzUzLjYxMyAxMDkuNzM0IDM1Ny4yMTYgMTE0LjYzMyAzNTYuMTY3IDEyMC43MzFMMzUzLjI3NyAxMzcuNTU0QzM1Mi4wMTQgMTQ0LjkxNSAzNTMuMTQ5IDE1NS43MDkgMzU4Ljc4IDE1Ni45MjVDMzY1LjY0NSAxNTguNDA4IDM2OS45MTUgMTQ4LjkxNiAzNjkuNjA4IDE0My4xNzdMMzY4Ljk1MyAxMzAuODgzQzM2OC41NzYgMTIzLjgxMiAzNjguMzA0IDExNC43MDkgMzczLjk0MSAxMTAuNjU1QzM3OS41MzEgMTA2LjYzIDM4Ny4yNTQgMTA2LjM0MSAzOTMuMzI1IDEwOS45ODlWMTA5Ljk4M1oiIGZpbGw9IiMxMjQ4NzUiLz4KPHBhdGggZD0iTTQ0NC44MzcgMTM1LjYwNkM0NDIuNDAzIDE0MC42MDkgNDQxLjg4OCAxNDYuMTExIDQ0Mi4yNyAxNTEuNjM2TDQ0NS4zMzUgMTY5LjQ3MkM0NDYuMzU0IDE3NS4zOTYgNDQzLjg4NyAxODAuODc1IDQzOC4yMTUgMTgyLjk4M0M0MzEuMjk4IDE4NS41NDggNDIzLjI0IDE4NS4zODYgNDE2Ljc0IDE4MS42NDVDNDEyLjI5NiAxNzkuMDg1IDQxMS4zIDE3My42MyA0MTIuMzcyIDE2OC45OTdMNDE1Ljk1MiAxNTMuNTEyQzQxNy4yNzkgMTQ0LjUxMyA0MTYuNDU2IDEzNC45NjkgNDEyLjg1OCAxMjYuNjA3QzQxMC4zNjcgMTIwLjgxNiA0MTAuODI1IDExNC43NTggNDE2LjYzIDExMC45OTRDNDIxLjMyMiAxMDcuOTQ4IDQyNy43MTIgMTA3LjE5NSA0MzMuMjQ0IDEwOC43MzVDNDM3LjM2OSAxMDkuODg4IDQzOS41NjUgMTEzLjAxNSA0NDAuMjI1IDExNy42NTlDNDQ0LjU4NyAxMTEuOTk2IDQ0OS44NzcgMTA4LjQ1MiA0NTYuNzQ3IDEwNy4xODlDNDY5LjY2NiAxMDQuODA5IDQ4MS43MTYgMTEzLjg2MSA0ODMuMTkzIDEyNy4wNThMNDgzLjI5MSAxMzkuODFMNDgzLjYzMyAxNTYuMTgyQzQ4My43MiAxNjAuNTA3IDQ4NS43NzcgMTY0LjIxNCA0ODcuODQ1IDE2Ny44MTZDNDkwLjkwOSAxNzMuMTcyIDQ4OS4wMzggMTc5LjQ0NCA0ODMuNjA0IDE4Mi4yNTlDNDc4LjEwNyAxODUuMTA4IDQ3MS42NDcgMTg1LjM4IDQ2NS43NjEgMTgzLjM3QzQ1NC44MyAxNzkuNjQxIDQ1Ni4wNTggMTY2LjgwMiA0NTcuMDQ5IDE1Ni43Mkw0NTguNzA1IDEzOS43OTNDNDU4Ljk3MiAxMzcuMDQ4IDQ1Ny43MjEgMTMzLjc0MSA0NTUuNTcxIDEzMi4xMzFDNDUxLjg1OCAxMjkuMzUyIDQ0Ni45MDUgMTMxLjMyMSA0NDQuODI1IDEzNS41OTRMNDQ0LjgzNyAxMzUuNjA2WiIgZmlsbD0iIzEyNDg3NSIvPgo8cGF0aCBkPSJNNTUzLjc3NyAxNTguMDU1QzU1NS45OTUgMTU1LjgwOCA1NTkuMTQ3IDE1NS4zODUgNTYxLjc4MyAxNTYuNDU3QzU2OC4wOTcgMTU5LjA0IDU2Ny44NDggMTcwLjU1MiA1NjAuNDczIDE3Ny4zMUM1NDUuMTU2IDE5MS4zNDggNTE4LjA4NSAxODguOTMzIDUwNS41NiAxNzIuMDgxQzQ5NC4wODQgMTU2LjY0MiA0OTQuODg5IDEzNS4xNTcgNTA3LjEwMSAxMjAuMzA5QzUyMC4zNjcgMTA0LjE3NSA1NDYuMTQ3IDEwMS45NTcgNTU5LjQzMSAxMTYuNjE0QzU2Ni44OTggMTI0Ljg1NSA1NjYuNzcxIDEzNi43MDMgNTU5LjE2NCAxNDQuODExQzU1MS40NjUgMTUzLjAxNyA1NDAuMjM4IDE1Mi4zNzQgNTMxLjAxNSAxNTkuNDY4QzUzNi45NzEgMTY2LjQ5MyA1NDcuMTY3IDE2NC43NSA1NTMuNzgyIDE1OC4wNTVINTUzLjc3N1pNNTM2LjU3MSAxMzguMjU1QzUzOC42MzkgMTM2LjkxMiA1NDAuMDEyIDEzNC41MzIgNTQwLjE0NSAxMzIuNjAzQzU0MC4zMDIgMTMwLjMyMiA1MzkuMzY5IDEyNy43NzQgNTM3LjIzMSAxMjYuNjE2QzUzMy45NDcgMTI0LjgzMiA1MjkuODIyIDEyNi4wMjUgNTI3LjIyMSAxMjguNzI5QzUyMi43NjYgMTMzLjM2MiA1MjEuNzA2IDE0MC40NzMgNTI0LjA1MiAxNDYuMzkyTDUzNi41NjUgMTM4LjI1NUg1MzYuNTcxWiIgZmlsbD0iIzEyNDg3NSIvPgo8cGF0aCBkPSJNMjA0LjMxMiAxNTYuNTJMMjA4LjQwNyAxNjcuNTM1QzIxMC41MTYgMTczLjIwNCAyMDguNjM5IDE3OC45NDMgMjAyLjkxNSAxODEuNTMyQzE5NS4yMzQgMTg1LjAxMiAxODUuODg0IDE4NC45OTUgMTc4LjA4NiAxODEuNTc4QzE3Mi40NjcgMTc5LjEyMyAxNzAuMjg4IDE3My4xNjQgMTcyLjIzNSAxNjcuNTIzQzE3Ny42NDYgMTUxLjg2NCAxNzkuNTgxIDEzNy43NTcgMTcxLjU5OCAxMjIuNDkyQzE2OS4zNjcgMTE4LjIyNCAxNzAuNDU2IDExMi43MTEgMTc0LjE0NyAxMDkuNjdDMTc4Ljk5NSAxMDUuNjc1IDE4NS4zMDQgMTAzLjk0MyAxOTEuMzc1IDEwNC42MzhDMTk3LjAxMiAxMDUuMjgxIDIwMC4xMTIgMTA5LjE3OCAyMDAuNDUzIDExNS4yM0MyMDQuMzIzIDEwNy44MjMgMjExLjA3OCAxMDQuMTI4IDIxOC45OTcgMTA0LjQ0N0MyMjMuODExIDEwNC42NDQgMjI4LjgyMiAxMDYuNTM4IDIzMS4xOTggMTExLjAxNEMyMzUuOTg4IDEyMC4wNiAyMzIuODY2IDEzNC40MzMgMjIzLjU3NCAxMzUuNjk1QzIxNy4wMjcgMTM2LjU4NyAyMTQuNTYgMTI5LjY2MSAyMDkuMDYyIDEzMC43NUMyMDEuOTYgMTMyLjE1NyAyMDEuNzQ1IDE0Ny4wNjMgMjA0LjMxMiAxNTYuNTE0VjE1Ni41MloiIGZpbGw9IiNGNzk0MUQiLz4KPHBhdGggZD0iTTYwMi40MzggMTgyLjM0NEM1OTUuMTczIDE4NS4wNjYgNTg3LjM0MSAxODQuNzU5IDU4MC4yNTYgMTgyLjA0OUM1NzQuNzk4IDE3OS45NjQgNTcxLjgyMSAxNzQuMjA4IDU3My43NzkgMTY4LjUyMUM1NzkuMzIzIDE1Mi40MTEgNTgwLjkyOCAxMzkuODY3IDU3My40NTQgMTIzLjkxM0M1NzAuNzQzIDExOC4xMjIgNTczLjY0NiAxMTEuNjE4IDU3OS4xODQgMTA5LjEzNEM1ODMuODUzIDEwNy4wMzggNTg4Ljc1NCAxMDYuNTQgNTkzLjcxOSAxMDcuNTgyQzU5OC4xMjIgMTA4LjUwMyA2MDAuNjAxIDExMS43ODYgNjAxLjA3IDExNi42NTFDNjA1LjYxOCAxMDcuMDMyIDYxNi40MTEgMTAzLjc0MyA2MjUuNDcxIDEwNy4wNjdDNjMwLjM2MSAxMDguODU2IDYzMy4wNiAxMTMuMDQ5IDYzMy4zMzggMTE4LjE4QzYzMy43NjcgMTI2LjA0NCA2MzEuMzk3IDEzNC42NDQgNjI0LjMzNiAxMzUuNzMyQzYxNy4zNzggMTM2LjgwNCA2MTUuNzczIDEzMC4xMjEgNjEwLjE4MyAxMzAuOTk1QzYwNC41OTMgMTMxLjg3IDYwMy40MjIgMTQxLjExMiA2MDMuNjcyIDE0Ny45MTdDNjAzLjkyMSAxNTQuNzIxIDYwNi4xOCAxNjEuMzQgNjA4Ljc5OCAxNjcuNzM0QzYxMS4yNDkgMTczLjcxIDYwOC43NTggMTc5Ljk3IDYwMi40MzIgMTgyLjMzOUw2MDIuNDM4IDE4Mi4zNDRaIiBmaWxsPSIjMTI0ODc1Ii8+CjxwYXRoIGQ9Ik0zMjguMTYzIDMzLjM3MzRDMzE3LjcxOCA4LjIyMjg2IDI4OC41MzIgLTIuMTgzNjEgMjY0LjQ5MSAxMC4xMDVDMjQ3Ljk2OSAxOC41NDgzIDIzOC4xOSAzNS44MzQ2IDIzOS4xODEgNTQuMzE5NkMyMzcuNzYxIDU0LjYyMDggMjM2LjU2MiA1NC44NzU1IDIzNS44OSA1NC43OTQ1QzIzMy4wOCA1NC40NTI4IDIzMi41OTQgMjUuMzkzMyAyNTcuMDM1IDguODU5OUMyODEuODUzIC03LjkyMjU1IDMxNS4xNDYgLTAuMTIyMDMxIDMyOS44MDkgMjUuOTk1NkMzMzQuNjI4IDM0LjU4OTUgMzM3LjM2OSA0NC40MjI3IDMzNi4zMzcgNTQuNTMzOUMzMzUuMDM0IDU1LjM0NDYgMzMyLjk3MiA1NC45MzM1IDMzMS45MDYgNTMuOTM3NEMzMzIuMjgyIDQ2Ljc2MjMgMzMwLjk4NSA0MC4xNDg5IDMyOC4xNjkgMzMuMzY3NkwzMjguMTYzIDMzLjM3MzRaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0yODUuNzY5IDY1LjM5MjJDMjkwLjMzMiA2NS4zOTIyIDI5NC4wMyA2MS42OTQ5IDI5NC4wMyA1Ny4xMzQxQzI5NC4wMyA1Mi41NzM0IDI5MC4zMzIgNDguODc2MSAyODUuNzY5IDQ4Ljg3NjFDMjgxLjIwNyA0OC44NzYxIDI3Ny41MDggNTIuNTczNCAyNzcuNTA4IDU3LjEzNDFDMjc3LjUwOCA2MS42OTQ5IDI4MS4yMDcgNjUuMzkyMiAyODUuNzY5IDY1LjM5MjJaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0yOTAuMTA4IDQ2Ljk2NTFDMjg2Ljg4NyA0NS4zNjY3IDI4NC4zNDQgNDUuNjMzMSAyODEuMzM3IDQ3LjAzNDZMMjgzLjk1IDI2LjQwNjhDMjg0LjA0MyAyNS42NTk4IDI4NS4xNjYgMjQuMzU2OCAyODUuODU2IDI0LjMzOTRDMjg2LjU0NSAyNC4zMjIgMjg3LjY5MiAyNS42MzA4IDI4Ny43NzkgMjYuMzcyMUwyOTAuMTE0IDQ2Ljk2NTFIMjkwLjEwOFoiIGZpbGw9IiNGNzk0MUQiLz4KPHBhdGggZD0iTTI4Ny41NTMgMTUuNjA2NUMyODcuNTUzIDE2LjIwMjkgMjg2LjgxOCAxNy4yNTY5IDI4Ni4zMzcgMTcuNDA3NUMyODUuNzU3IDE3LjU4NyAyODQuMjM0IDE2LjY3MiAyODQuMjI4IDE2LjAxNzZMMjg0LjE2NCA5LjMwNTgxQzI4NC4xNjQgOC43MjA5MSAyODUuMzYzIDcuNjM3OTUgMjg1Ljg5NiA3LjY3MjY5QzI4Ni41MTYgNy43MTMyMyAyODcuNTY1IDguODQ4MjYgMjg3LjU2NSA5LjU0MzE5TDI4Ny41NTMgMTUuNjAwN1YxNS42MDY1WiIgZmlsbD0iI0Y3OTQxRCIvPgo8cGF0aCBkPSJNMjUwLjE0NyA1MC42NDgxTDI0Mi45ODEgNTAuNzExOEMyNDIuMzc4IDUwLjcxMTggMjQxLjc0NyA0OS4xOTQ1IDI0MS44NjggNDguNjczM0MyNDIuMDEzIDQ4LjA0NzkgMjQzLjIzNiA0Ny4xNzkyIDI0My45MzcgNDcuMjMxNEwyNTAuMTI0IDQ3LjcwMDRDMjUwLjkxMiA0Ny43NTgzIDI1MS4xMDMgNTAuNjQ4MSAyNTAuMTQxIDUwLjY1MzlMMjUwLjE0NyA1MC42NDgxWiIgZmlsbD0iI0Y3OTQxRCIvPgo8cGF0aCBkPSJNMzIxLjczOSA1MC44Mjc2QzMyMS4yNTIgNTAuODUwOCAzMjAuNDk5IDQ5LjY2MzYgMzIwLjUyMiA0OS4yMTE5QzMyMC41NTEgNDguNjY3NSAzMjEuNDMyIDQ3LjU1NTcgMzIyLjAyOCA0Ny41MjY4TDMyOC41MTEgNDcuMTc5M0MzMjkuNDIgNDcuMTMzIDMyOS42NTIgNTAuNDUxMiAzMjguNjM4IDUwLjQ5NzZMMzIxLjczOSA1MC44Mjc2WiIgZmlsbD0iI0Y3OTQxRCIvPgo8cGF0aCBkPSJNMjUzLjc0NCAzNC4wNTA5TDI0OC4xNiAzMC42NjlDMjQ3LjYyMSAzMC4zNDQ3IDI0Ny45MzQgMjguNjY1MiAyNDguNDIxIDI4LjM2OTlDMjQ4LjkwNyAyOC4wNzQ1IDI1MC4yMDUgMjguMDQ1NiAyNTAuNzg0IDI4LjQyMjFMMjU1Ljk2MyAzMS43ODA4QzI1Ni4yNzYgMzEuOTgzNSAyNTYuMTQzIDMzLjIxMTIgMjU1LjkyMyAzMy41MTIzQzI1NS42NDUgMzMuODg4OCAyNTQuMTkgMzQuMzIzMSAyNTMuNzQ0IDM0LjA1MDlaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0yNjguNDA3IDE4LjUyNTJDMjY4LjcwOCAxOS4wNDY0IDI2OC40NjUgMjAuNTQ2MyAyNjguMDMgMjAuODkzOEMyNjcuNTI2IDIxLjI5OTIgMjY2LjAwOSAyMC45NTE3IDI2NS42ODQgMjAuMzQ5NEwyNjIuNzI0IDE0LjlDMjYyLjMzNiAxNC4xODc3IDI2NC4wOTEgMTIuNjc2MyAyNjUuMDc2IDEyLjc1NzNMMjY4LjQwNyAxOC41MTk0VjE4LjUyNTJaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0zMDUuMzU2IDIwLjY4NTNDMzA1LjE0NyAyMS4wNzkxIDMwMy44MzIgMjEuMjgxOCAzMDMuNDk2IDIxLjEwOEMzMDMuMDc5IDIwLjg5MzggMzAyLjM2MSAxOS43NDcyIDMwMi41NjkgMTkuMzEyOEwzMDUuMzYxIDEzLjUyMThDMzA1LjU5MyAxMy4wNDExIDMwNy4yMjcgMTMuMDEyMSAzMDcuNTk4IDEzLjM4ODVDMzA3Ljk2OCAxMy43NjQ5IDMwOC4zMTYgMTUuMDUwNiAzMDguMDY3IDE1LjUyNTVMMzA1LjM1IDIwLjY4NTNIMzA1LjM1NloiIGZpbGw9IiNGNzk0MUQiLz4KPHBhdGggZD0iTTMxNy42NTUgMzMuODk0N0MzMTcuMjE0IDM0LjE1NTMgMzE1Ljg1OSAzNC4wOCAzMTUuNTUyIDMzLjY2ODhDMzE1LjI0NSAzMy4yNTc2IDMxNS4zNzggMzEuNzU3OCAzMTUuODcgMzEuNDQ1MUwzMjAuNDUzIDI4LjQ5NzRDMzIxLjIzNSAyNy45OTM2IDMyMi4zNyAyOC4wOTc4IDMyMi45NDQgMjguODEwMUMzMjMuNTE3IDI5LjUyMjQgMzIzLjEgMzAuNzA5NiAzMjIuMjQzIDMxLjIxMzRMMzE3LjY1NSAzMy45MDA1VjMzLjg5NDdaIiBmaWxsPSIjRjc5NDFEIi8+CjxwYXRoIGQ9Ik0zNDguMTI3IDg2Ljg4MjdMMzQxLjg3IDY0LjUwMDNDMzQwLjc2OSA2My40IDMzOS40NDggNjIuMDEwMiAzMzguMDY0IDYxLjU4MTdMMzI4LjIxIDU4LjU0MTRDMzE3Ljk2NyA1Ni41MDg3IDMwNy44NjQgNTUuNTM1OCAyOTcuNDQ4IDU1LjMxNTdMMjk3LjQ2IDU4LjU3NjFDMzA1LjU5OSA1OC45NTI1IDMxMy4zMzMgNTkuNDg1MyAzMjEuMzA0IDYwLjg4NjdMMzMwLjkzMyA2My42MDg1QzMzMS44MDEgNjMuODUxNyAzMzIuOTM3IDY1LjM5MjIgMzMzLjEyOCA2Ni4yODk4QzMzMi4wMSA2Ny42NDQ5IDMzMC4yMiA2OC44ODQyIDMyOC41MDUgNjkuMzkzOEMzMjMuMDI1IDcxLjAyMTEgMzE3Ljc0NyA3Mi4xNjc3IDMxMS45NzIgNzIuNzkzMUMyOTQuNzIgNzQuNjUyIDI3Ny41NTQgNzQuNzY3OSAyNjAuMzE0IDcyLjgwNDdDMjU0LjA2MyA3Mi4wOTI0IDI0Mi4xMjkgNjkuODg2IDIzOS4xMzQgNjYuODYzMUMyMzcuNTk5IDY1LjMxNjkgMjQwLjc5MSA2Mi45OTQ3IDI0NS4yOTIgNjEuOTM0OUMyNTQuOTQ0IDU5LjY2NDggMjY0LjM0IDU4Ljg1OTkgMjc0LjI1OCA1OC42ODAzTDI3NC4zNDUgNTUuMjIzQzI2MS4xMjUgNTUuODg5IDI0NC45MSA1Ni43NjM1IDIzMy4yODkgNjEuNzE0OEMyMzEuMjY3IDYyLjU3NzcgMjI5Ljg1NCA2NC40MTkyIDIyOS4yOTIgNjYuNDYzNUwyMjMuNTE2IDg3LjM5ODFDMjIyLjU4MyA5MC43ODAxIDIyNC43MDkgOTQuNDY5IDIyNy4zNjggOTYuNDAzMkMyMzUuMjAxIDEwMi4xMDcgMjUwLjU0MSAxMDYuNDk3IDI1OS45NDMgMTA2LjEwOUMyNjQuMzc1IDEwNS45MjQgMjY3Ljg2MyAxMDguMzU2IDI2OC4xMjMgMTEzLjA2NEMyNjguNDk0IDExOS42ODkgMjY3LjU1NSAxMjYuMjEgMjY2LjUwMSAxMzIuODgxTDI2MS44OTYgMTYyLjA4NUMyNjEuMDUgMTY3LjQzNiAyNjIuNjI1IDE3My4wNTMgMjY2LjAyIDE3Ny4wNjdDMjcyLjcwNiAxODQuOTcxIDI4OC4xNSAxODUuNjkgMjk3LjQyNSAxODIuMjM4QzMwNy45MjIgMTc4LjMzNSAzMTAuMzk2IDE2OC4zMjIgMzA4Ljc0NSAxNTcuNDkzTDMwMy43OTcgMTI1LjA1N0MzMDMuMTYgMTIwLjg4OCAzMDIuOTkyIDExNi41MzMgMzAzLjQwOSAxMTIuNTMxQzMwMy45MDIgMTA3LjgxMiAzMDcuNTUxIDEwNi4xMzggMzExLjc2OSAxMDYuMDk3QzMyMy4xMDYgMTA1Ljk4MiAzNTAuNzA1IDk5LjgzNzMgMzQ4LjEzOCA4Ni44OTQzTDM0OC4xMjcgODYuODgyN1pNMjg4LjU1NiA3OS42NDk3QzI4OS4xMTggNzkuMDM1OCAyOTAuMjQxIDc4LjY3MSAyOTEuMDQxIDc4LjcxNzNDMjkzLjY3NyA3OC44NjIxIDI5NS42MTcgODQuMzA1NyAyOTIuNjI4IDg4LjE2ODNDMjkxLjk2MiA4OS4wMzEyIDI5MC43OTIgODkuNDg4NyAyODkuODY1IDg5LjQ0ODJDMjg5LjEyOSA4OS40MTM0IDI4Ny45MzYgODguNzMwMSAyODcuNTAxIDg3LjkxOTNDMjg2LjA1MyA4NS4xOTc1IDI4Ni40ODIgODEuOTMxNCAyODguNTUgNzkuNjU1NUwyODguNTU2IDc5LjY0OTdaTTI3OS41MyA3OC45NTQ4QzI4Mi42MzUgNzguNDIyIDI4NS4zMDYgODMuNTE4MSAyODMuNzY1IDg3LjUzNzFDMjgzLjM2NSA4OC41Nzk1IDI4Mi4yNyA4OS40NzcxIDI4MS41IDg5LjYyNzdDMjgwLjUwMyA4OS44MjQ2IDI3OS4xODIgODkuNDQ4MSAyNzguNDcgODguNjc3OUMyNzUuMjIgODUuMTY4NSAyNzYuOTA2IDc5LjQwNjUgMjc5LjUzIDc4Ljk1NDhaTTI3Mi4wNjMgOTUuNjk2N0MyNzAuMzc3IDkzLjY0MDggMjcwLjE4NiA5MC44MDMyIDI3MS4zNjIgODguNDU3OUMyNzIuMDY4IDg3LjA1MDYgMjczLjcyNSA4Ni42OTE2IDI3NC45ODggODcuNjAwOEMyNzYuOTY5IDg5LjAyNTQgMjc4LjM2IDkxLjMxMjggMjc3LjkzNyA5My45NDc4QzI3Ny43MDUgOTUuMzgzOSAyNzYuNjMzIDk2LjQ5MDEgMjc1LjU2NyA5Ni43OTdDMjc0LjMyOCA5Ny4xNTYgMjcyLjkxNCA5Ni43MzMzIDI3Mi4wNjMgOTUuNjk2N1pNMjk1LjQ5NiAxMDQuNDQxQzI5NC4zMjYgMTA2LjM1OCAyOTEuNzEzIDEwNy4wOTkgMjg5LjQwNyAxMDUuOTk5QzI4Ni45NTEgMTA0LjgyOSAyODQuNzE1IDEwNS4wMDkgMjgyLjU0MiAxMDYuMjgzQzI4MC4zNyAxMDcuNTUxIDI3Ny43MzQgMTA2LjkxNCAyNzYuMzkgMTA0Ljk4QzI3NS4xMjcgMTAzLjE2NyAyNzUuMzAxIDEwMC4zODIgMjc3LjEwOCA5OC43NTQ0QzI3OC44NTggOTcuMTc5MiAyODAuMDk4IDk1LjQ0NzcgMjgxLjE0NiA5My4zNjI5QzI4Mi4wNTYgOTEuNTUwMyAyODMuNzg4IDkwLjM3NDcgMjg1LjYwMSA5MC4yOTM2QzI4Ny40NjcgOTAuMjEyNiAyODkuMzYxIDkxLjI4MzkgMjkwLjMxNyA5My4wNTAyQzI5MS40NyA5NS4xODEzIDI5Mi45MTggOTYuNzk3IDI5NC42OTYgOTguMzc3OUMyOTYuNDgxIDk5Ljk2NDcgMjk2LjYyNSAxMDIuNTk0IDI5NS41MDIgMTA0LjQ0MUgyOTUuNDk2Wk0yOTguODM4IDk1LjU1MTlDMjk3LjI4IDk2Ljk0MTcgMjk1LjAzOCA5Ni40MDkgMjk0LjEwNSA5NC43MzU0QzI5Mi41NDcgOTEuOTMyNSAyOTMuNjMgODguNTEgMjk2LjMxMyA4Ni44MTMyQzI5Ny40NDggODYuMDk1MSAyOTguNzg2IDg2LjMwOTQgMjk5LjYyNiA4Ny40NDQ0QzMwMS4zOTkgODkuODQ3NyAzMDEuMjE0IDkzLjQzMjQgMjk4LjgzOCA5NS41NTE5WiIgZmlsbD0iIzEyNDg3NSIvPgo8L2c+Cjwvc3ZnPg==");
            }
          }
        `}</style>

        {/* ─── Print-only combined report ────────────────────────────────
            Hidden during normal browsing (display:none via CSS above).
            Rendered only when the browser print dialog is triggered. */}
        {feedPlanUnlocked && dailyDM && pctBatch && createPortal(
          <div className="print-only">
            <div className="print-watermark" />

            {/* Patient & Energy */}
            <div style={{ border: "1.5px solid #FA9A36", borderRadius: "10px", overflow: "hidden", marginBottom: "24px", breakInside: "avoid" }}>
              <div style={{ background: "#FA9A36", padding: "10px 16px" }}>
                <p style={{ color: "#211915", fontSize: "16px", fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>Patient &amp; Energy</p>
              </div>
              <div style={{ background: "#FFDCB7", padding: "14px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                  {[
                    ["Patient name / ID", profile.dogName || (profile as any).catName || "—"],
                    ["Breed", profile.breed || "Unknown breed"],
                    ["Sex", profile.sex === "M" ? "Male" : "Female"],
                    ["Age", profile.age],
                    ["Body weight (kg)", String(profile.weightKg)],
                    ...(petType === "dog" ? [["Activity Level", String((profile as any).activity ?? "—")]] : []),
                    ["Daily energy need MER (kcal/day)", profile.den.toLocaleString()],
                  ].map(([label, value]) => (
                    <React.Fragment key={String(label)}>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#211915", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: "13px", fontWeight: 800, color: "#211915", textAlign: "right", margin: 0 }}>{String(value)}</p>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Fresh weight to serve per batch (g) */}
            <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "16px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "6px", marginBottom: "12px" }}>Fresh weight to serve per batch (g)</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "24px" }}>
              <thead>
                <tr style={{ background: "#143C6F", color: "#fff" }}>
                  <th style={{ padding: "8px 8px", textAlign: "left", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Ingredient</th>
                  <th style={{ padding: "8px 8px", textAlign: "center", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Unit</th>
                  {DAYS.map(d => (
                    <th key={d} style={{ padding: "8px 6px", textAlign: "right", fontSize: "13px", fontWeight: 800 }}>{d}d</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r, i) => {
                  if (Number(r.dm_g) <= 0) return null;
                  const frac = Number(r.dm_g) / totalDM;
                  const ingDailyDM = frac * dailyDM;
                  const wf = Number(r.water_percent) / 100;
                  let ingFresh = wf < 1 ? ingDailyDM / (1 - wf) : ingDailyDM;
                  // EXCEPTION: Oyster canned is scaled by 10/14.9 for this batch table only,
                  // matching the same correction applied server-side in diet_router.py.
                  if (r.ingredient.trim().toLowerCase() === "oyster canned") {
                    ingFresh = ingFresh * (10.0 / 14.9);
                  }
                  return (
                    <tr key={i} style={{ background: i % 2 ? "#fff" : "#E0F2FF", borderBottom: "1px solid #A6CCE8" }}>
                      <td style={{ padding: "5px 8px" }}>{cleanIngredientName(r.ingredient)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: "#3C6293" }}>grams</td>
                      {DAYS.map(d => (
                        <td key={d} style={{ padding: "5px 6px", textAlign: "right", fontFamily: "monospace" }}>{(ingFresh * d).toFixed(1)}</td>
                      ))}
                    </tr>
                  );
                })}
                <tr style={{ background: "#143C6F", color: "#fff" }}>
                  <td style={{ padding: "8px 8px", fontSize: "12px", fontWeight: 700 }}>Total (grams)</td>
                  <td style={{ padding: "5px 8px" }}></td>
                  {DAYS.map(d => {
                    const tot = breakdown.reduce((s, r) => {
                      if (Number(r.dm_g) <= 0) return s;
                      const frac = Number(r.dm_g) / totalDM;
                      const ingDailyDM = frac * dailyDM;
                      const wf = Number(r.water_percent) / 100;
                      let ingFresh = wf < 1 ? ingDailyDM / (1 - wf) : ingDailyDM;
                      if (r.ingredient.trim().toLowerCase() === "oyster canned") {
                        ingFresh = ingFresh * (10.0 / 14.9);
                      }
                      return s + ingFresh * d;
                    }, 0);
                    return <td key={d} style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontSize: "12px", fontWeight: 600 }}>{tot.toFixed(1)}</td>;
                  })}
                </tr>
              </tbody>
            </table>

            {/* Diet Nutrient Composition */}
            <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "16px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "6px", marginBottom: "12px" }}>Diet Nutrient Composition</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "28px" }}>
              <thead>
                <tr style={{ background: "#143C6F", color: "#fff" }}>
                  <th style={{ padding: "8px 8px", textAlign: "left", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Nutrient</th>
                  <th style={{ padding: "8px 8px", textAlign: "left", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Unit</th>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Dry Matter Basis</th>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>Per 1000 Kcal DM</th>
                </tr>
              </thead>
              <tbody>
                {unifiedSections
                  .filter(section => section.rows.some(row => row.val != null))
                  .map(section => (
                  <React.Fragment key={section.cat}>
                    <tr>
                      <td colSpan={4} style={{ padding: "8px 8px", background: "#BEE2FB", color: "#143C6F", fontWeight: 900, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{section.cat}</td>
                    </tr>
                    {section.rows
                      .filter(row => row.val != null)
                      .map(row => {
                      const perKcalVal = calcPerKcal(row.val, (row as any).perKcal);
                      const perKcalStr = perKcalVal != null ? perKcalVal.toFixed(row.dec ?? 2) : "—";
                      return (
                        <tr key={row.label} style={{ borderBottom: "1px solid #A6CCE8" }}>
                          <td style={{ padding: "5px 8px" }}>{row.label}</td>
                          <td style={{ padding: "5px 8px" }}>{row.unit}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{row.val != null ? Number(row.val).toFixed(row.dec ?? 2) : "—"}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>{perKcalStr}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Macro Pie Chart (% of Energy) — fills the empty space before the Appendix page */}
            <div style={{ breakInside: "avoid", marginTop: "56px", marginBottom: "28px", display: "flex", flexDirection: "column", alignItems: "center", border: "1.5px solid #A6CCE8", borderRadius: "14px", padding: "48px 40px", minHeight: "460px", justifyContent: "center" }}>
              <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "22px", fontWeight: 700, margin: "0 0 28px", letterSpacing: "0.03em", textAlign: "center" }}>Macro Pie Chart (% of Energy)</p>

              <svg width="260" height="260" viewBox="0 0 220 220" style={{ marginBottom: "28px" }}>
                {macroPieArcs.map(arc => (
                  <path key={arc.label} d={arc.path} fill={arc.color} stroke="#FFFFFF" strokeWidth={3} />
                ))}
                {macroPieArcs.map(arc => (
                  arc.fraction > 0.02 && (
                    <text
                      key={arc.label + "-label"}
                      x={arc.labelPoint.x}
                      y={arc.labelPoint.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fontSize: "17px", fontWeight: 700, fill: arc.label === "CHO" ? "#143C6F" : "#FFFFFF" }}
                    >
                      {(arc.fraction * 100).toFixed(1)}%
                    </text>
                  )
                ))}
              </svg>

              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", marginBottom: "18px" }}>
                {macroPieSlices.map(slice => (
                  <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
                    <span style={{ width: "13px", height: "13px", borderRadius: "3px", background: slice.color, display: "inline-block", flex: "none" }} />
                    <span style={{ fontSize: "15px", color: "#211915", fontWeight: 600 }}>{slice.label}</span>
                    <span style={{ fontSize: "15px", color: "#211915", fontFamily: "monospace", marginLeft: "auto" }}>
                      {macroPieTotal > 0 ? ((slice.value / macroPieTotal) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: "13.5px", color: "#3C6293", margin: 0, maxWidth: "340px", lineHeight: 1.5, textAlign: "center" }}>
                Share of total dietary energy (kcal) contributed by protein, fat, and carbohydrates.
              </p>
            </div>

            {/* Appendix — Preparing Your Pet's FurTuner Recipe */}
            <div style={{ breakBefore: "page", paddingTop: "8px" }}>
              <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "18px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "8px", marginBottom: "16px" }}>
                Appendix — Preparing Your Pet's FurTuner Recipe
              </p>
              <p style={{ fontSize: "12px", color: "#211915", marginBottom: "14px" }}>
                To ensure the diet is prepared as formulated, please follow these instructions carefully.
              </p>

              {[
                {
                  title: "Step 1: Weigh all ingredients before cooking",
                  body: [
                    "All ingredient amounts provided in your FurTuner recipe are listed on a raw (uncooked) weight basis. The only exception is the boiled egg.",
                    "Weigh each ingredient using a kitchen scale before cooking.",
                    "Do not substitute cooked weights for raw weights, as cooking changes moisture content and can significantly alter ingredient weights.",
                  ],
                },
                {
                  title: "Step 2: Prepare the ingredients",
                  body: [
                    "Meat, poultry, and fish — cooking is optional but generally recommended: it improves food safety by reducing harmful bacteria and parasites, improves digestibility for many pets, and makes preparation and storage easier. Preferred methods: boiling, steaming, or baking.",
                    "Grains — rice, oats, barley, quinoa, pasta, and potatoes should be cooked before feeding. Preferred methods: boiling or simmering.",
                    "Vegetables — should be cooked to improve digestibility and nutrient availability. Preferred methods: steaming or boiling, until tender.",
                  ],
                },
                {
                  title: "Step 3: Cool the ingredients",
                  body: ["After cooking, allow all ingredients to cool to room temperature or slightly warm."],
                },
                {
                  title: "Step 4: Prepare fruits (if included)",
                  body: ["Chop fruits into small, bite-sized pieces before mixing with the other ingredients."],
                },
                {
                  title: "Step 5: Mix all ingredients together",
                  body: [
                    "Once the meats, grains, and vegetables have cooled, place all ingredients (including fruits if used) in a large mixing container.",
                    "Add any additional ingredients included in the recipe (e.g. brewer's yeast, dried kelp, eggshell powder). It's recommended to mix these with water first to ensure an even distribution.",
                    "Mix thoroughly to ensure uniform distribution of ingredients.",
                  ],
                },
                {
                  title: "Step 6: Add oils last",
                  body: [
                    "All oils should be added after cooking and after all other ingredients have been mixed together, to preserve essential fatty acids, reduce heat-related nutrient losses, and ensure more uniform distribution.",
                    "After adding oils, mix thoroughly one final time.",
                  ],
                },
                {
                  title: "Step 7: Portion and store",
                  body: [
                    "Refrigeration — store prepared food in airtight containers; refrigerate portions that will be used within 2–3 days.",
                    "Freezing — freeze remaining portions immediately; individual daily portions are recommended for convenience; thaw frozen portions in the refrigerator before feeding.",
                    "Meal size — the recommended daily food intake is an estimate based on your pet's calculated daily energy requirement and the diet's energy density. Actual needs vary by age, breed, activity level, metabolism, and environment. Use these amounts as a starting point, monitor body weight, body condition, appetite, and energy level, and adjust as needed — reduce gradually for unwanted weight gain, increase gradually if losing weight or acting hungry despite healthy body condition. Regularly checking body weight and body condition score (BCS) is the best way to ensure long-term feeding success.",
                  ],
                },
              ].map((step, i) => (
                <div key={i} style={{ marginBottom: "12px", breakInside: "avoid" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#3C6293", margin: "0 0 4px" }}>{step.title}</p>
                  {step.body.map((line, j) => (
                    <p key={j} style={{ fontSize: "11.5px", color: "#211915", margin: "0 0 6px", lineHeight: 1.5 }}>{line}</p>
                  ))}
                </div>
              ))}

              <p style={{ fontSize: "13px", fontWeight: 700, color: "#3C6293", margin: "10px 0 4px" }}>Additional notes</p>
              {[
                "Introduce any new diet gradually over 5–7 days whenever possible.",
                "Always provide fresh, clean drinking water.",
                "Follow the recipe exactly as formulated. Do not substitute ingredients or alter ingredient amounts without reformulating the diet.",
                "Nutrient concentrations may vary slightly depending on ingredient source, storage conditions, and cooking methods.",
                "If your pet develops vomiting, diarrhea, reduced appetite, lethargy, or any other unusual signs, discontinue feeding the diet and consult your veterinarian.",
                "For best results, always weigh ingredients accurately, cook ingredients appropriately, and add oils only after cooking and mixing are complete.",
              ].map((line, i) => (
                <p key={i} style={{ fontSize: "11.5px", color: "#211915", margin: "0 0 6px", lineHeight: 1.5 }}>• {line}</p>
              ))}
            </div>
          </div>,
          document.body
        )}

        <div className="screen-only">

        {!feedPlanUnlocked && (
        <>
        {/* Ingredients section — always visible, sits above the nutrient table */}
        <p className="text-[#143C6F] uppercase text-center" style={{ fontSize: "32px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "10px", marginBottom: "24px", letterSpacing: "0.02em", textAlign: "center" }}>Ingredients</p>
        {(() => {
          const nonFixed = breakdown.filter(r => !r.fixed);
          const selectedSet = new Set(nonFixed.map(r => r.ingredient));
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

              {/* COL 1: Selected — 2-column grid */}
              <div>
                <p className="text-[#211915]" style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px" }}>Selected</p>
                <div className="grid grid-cols-2 gap-3">
                  {nonFixed.map(r => (
                    <span key={r.ingredient} className="bg-[#BEE2FB] text-[#211915] text-[14px] font-bold px-4 py-3 rounded-full text-center">
                      {cleanIngredientName(r.ingredient)}
                    </span>
                  ))}
                </div>
              </div>

              {/* COL 2: Additional Ingredients — 3-column grid */}
              <div>
                <p className="text-[#211915]" style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>Possible Additions for Diet Balancing</p>
                <div style={{ background: "#FBEAEC", border: "1.5px solid #E7B8C0", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "20px", height: "20px", borderRadius: "50%", background: "#7A1F2B", color: "#fff", fontSize: "12px", fontWeight: 700, marginTop: "1px" }}>i</span>
                  <p
                    style={{
                      fontSize: "16px", color: "#7A1F2B", fontWeight: 700, lineHeight: 1.55, margin: 0,
                    }}
                  >
                    FurTuner may automatically select some of the ingredients below to ensure a complete and balanced diet based on your selected ingredients.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3" style={{ alignItems: "start" }}>
                  {shuffledFixed.map(r => {
                    const name = cleanIngredientName(r.ingredient);
                    const allowWrap = name.length > 24;
                    const isBrewersYeast =
                      /brewer/i.test(name) && /yeast/i.test(name) && /dried/i.test(name);
                    const driedSplit = isBrewersYeast
                      ? name.match(/^(.*?)\s*(\bdried\b.*)$/i)
                      : null;
                    return (
                      <span
                        key={r.ingredient}
                        className="bg-[#FA9A36] text-[#211915] text-[14px] font-bold px-4 py-3 rounded-full text-center"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxSizing: "border-box",
                          lineHeight: 1.2,
                          whiteSpace: allowWrap ? "normal" : "nowrap",
                          overflow: allowWrap ? "visible" : "hidden",
                          textOverflow: allowWrap ? "clip" : "ellipsis",
                        }}
                      >
                        {driedSplit ? (
                          <>
                            {driedSplit[1]}
                            <br />
                            {driedSplit[2]}
                          </>
                        ) : (
                          name
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Overview & AAFCO — unified single table, always visible */}
        <p className="text-[#143C6F] uppercase" style={{ fontSize: "26px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "10px", marginBottom: "24px", letterSpacing: "0.02em" }}>Overview &amp; AAFCO</p>
        <div>
            <div className="overflow-x-auto rounded-[12px] border border-[#A6CCE8] shadow-sm">
              <table className="w-full text-[13px] border-collapse" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr className="bg-[#143C6F] text-white">
                    <th className="uppercase tracking-wider" style={{ width: "26%", padding: "16px 16px", textAlign: "left", fontSize: "22px", fontWeight: 800 }}>Nutrient</th>
                    <th className="uppercase tracking-wider" style={{ width: "18%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800 }}>Unit</th>
                    <th className="uppercase tracking-wider" style={{ width: "18%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800, lineHeight: 1.15 }}>
                      <div>Diet</div>
                      <div>Value</div>
                    </th>
                    <th className="uppercase tracking-wider" style={{ width: "20%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800 }}>AAFCO Minimum</th>
                    <th className="uppercase tracking-wider" style={{ width: "18%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unifiedSections
                    .filter(section => section.rows.some(row => row.val != null))
                    .map(section => (
                    <React.Fragment key={section.cat}>
                      <tr>
                        <td colSpan={5} className="font-black uppercase tracking-wider" style={{ padding: "16px 18px", background: "#BEE2FB", color: "#143C6F", fontSize: "22px", fontWeight: 900, letterSpacing: "0.04em" }}>
                          {section.cat}
                        </td>
                      </tr>
                      {section.rows
                        .filter(row => row.val != null)
                        .map(row => {
                        const minVal = (row.min != null && row.min !== 0) ? row.min : null;
                        // Use backend aafco_percent_of_minimum if available, else calculate
                        const aafcoPctRaw = (row as any).aafcoPct;
                        const pct = aafcoPctRaw != null
                          ? Number(aafcoPctRaw) * 100
                          : (row.val != null && minVal != null && minVal > 0)
                            ? (Number(row.val) / minVal) * 100
                            : null;
                        let badge;
                        const alwaysGreenLabels = ["ME (kcal/kg)", "Crude fiber", "Ash", "Carbohydrates"];
                        if (alwaysGreenLabels.includes(row.label)) {
                          badge = <span className="text-[#2E7D32] font-bold" style={{ fontSize: "20px", textShadow: "0 0 8px rgba(46,125,50,0.65), 0 0 2px rgba(46,125,50,0.9)" }}>✓</span>;
                        } else if (pct === null)    badge = <span className="text-[#3C6293]" style={{ fontSize: "18px" }}>—</span>;
                        else if (pct >= 100) badge = <span className="text-[#2E7D32] font-bold" style={{ fontSize: "20px", textShadow: "0 0 8px rgba(46,125,50,0.65), 0 0 2px rgba(46,125,50,0.9)" }}>✓</span>;
                        else if (pct >= 90)  badge = <span className="text-[#FF9D36] font-bold" style={{ fontSize: "20px", textShadow: "0 0 8px rgba(255,157,54,0.65), 0 0 2px rgba(255,157,54,0.9)" }}>⚠</span>;
                        else                 badge = <span className="text-[#AD0B39] font-bold" style={{ fontSize: "20px", textShadow: "0 0 8px rgba(173,11,57,0.65), 0 0 2px rgba(173,11,57,0.9)" }}>✗</span>;
                        const dietVal = row.val != null ? Number(row.val).toFixed(row.dec ?? 2) : "";
                        return (
                          <tr key={row.label} className="border-b border-[#A6CCE8] last:border-0 hover:bg-[#FFDCB7]/20 transition">
                            <td style={{ padding: "12px 16px", textAlign: "left", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.label}</td>
                            <td style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.unit}</td>
                            <td className="font-mono font-semibold" style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{dietVal}</td>
                            <td className="font-mono" style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{minVal != null ? minVal : ""}</td>
                            <td style={{ padding: "12px 16px", textAlign: "center", fontSize: "15px" }}>{badge}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ height: "1px", background: "#A6CCE8", margin: "40px 0" }}></div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "48px", flexWrap: "wrap", padding: "36px 20px" }}>
              {[
                { icon: "✓", label: "Meets minimum",        color: "#2E7D32" },
                { icon: "⚠", label: "Within 10%\nof minimum", color: "#FF9D36" },
                { icon: "✗", label: "Below minimum",        color: "#AD0B39" },
              ].map(({ icon, label, color }) => (
                <div key={icon} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "48px", fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 14px ${color}99, 0 0 4px ${color}` }}>{icon}</span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#211915", textAlign: "center", whiteSpace: "pre-line" }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: "1px", background: "#A6CCE8", margin: "0 0 40px" }}></div>
            <div className="flex justify-center" style={{ marginBottom: "8px" }}>
              <button
                type="button"
                onClick={onBack}
                className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                  padding: "18px 28px",
                  borderRadius: "12px",
                }}
              >
                ← Back to Ingredients
              </button>
            </div>
        </div>
        </>
        )}

        {/* Daily Feeding Plan — Patient & Energy + feeding table; pay-gate unchanged.
            Ingredients / Overview & AAFCO (above) are hidden once payment unlocks the plan,
            so the paid view goes straight from Patient & Energy into the feeding plan. */}
        {(
          <div className="mt-8">

            {!feedPlanUnlocked ? (
              /* Pay gate → customer profile → disclaimer → payment */
              <CheckoutFlow
                onUnlock={() => {
                  setFeedPlanUnlocked(true);
                  // Land on the top of the Diet Report (Patient & Energy) after
                  // unlocking — same scroll-to-top behavior every other step
                  // transition uses, so "Skip Payment" doesn't leave the page
                  // scrolled wherever the payment panel happened to be.
                  requestAnimationFrame(() => {
                    document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
                petType={petType as PetType}
                dietType={dietType as DietType}
                profile={profile}
                selectedIngredients={selectedIngredients}
                result={result}
                allIngredients={allIngredients}
              />
            ) : dailyDM && pctBatch ? (
              <>
                {/* PATIENT & ENERGY Card */}
                <div style={{ border: "1.5px solid #FA9A36", borderRadius: "12px", overflow: "hidden", marginBottom: "32px" }}>
                  <div style={{ background: "#FA9A36", padding: "14px 20px" }}>
                    <p style={{ color: "#211915", fontSize: "20px", fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "10px" }}>
                      <svg width="24" height="24" viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.3099 13.7447C16.7902 12.9244 18.3875 12.4761 20.0363 13.0364C21.7601 13.6237 23.0389 15.0626 24.7346 15.7216C26.0321 16.2237 27.5123 16.2505 28.7349 16.9005C30.618 17.9002 31.4143 20.2985 30.7913 22.2709C30.1683 24.2433 28.3461 25.7405 26.2991 26.3815C24.9313 26.8074 23.4371 26.906 22.1723 27.565C20.8326 28.2688 19.9005 29.5329 18.5889 30.286C17.1789 31.0929 15.3708 31.2274 13.8485 30.6312C12.3261 30.035 11.1316 28.7305 10.7147 27.2108C10.2791 25.615 10.6726 23.916 11.2534 22.356C11.8296 20.8005 12.5931 19.2898 12.9116 17.6671C13.0709 16.8602 13.1224 16.0174 13.4456 15.2554C13.7688 14.4933 14.5605 14.0719 15.3146 13.7492L15.3099 13.7447Z" fill="#211915"/>
                        <path d="M27.1703 4.22291C28.0228 4.60395 28.688 5.30773 29.133 6.10118C29.578 6.89462 29.8122 7.78221 29.9668 8.67427C30.1869 9.94289 30.2432 11.2787 29.7419 12.4712C29.2407 13.6636 28.0744 14.6677 26.7347 14.6901C25.3856 14.717 24.1724 13.7487 23.6197 12.5653C23.0716 11.3863 23.0716 10.037 23.2356 8.75496C23.362 7.76428 23.5822 6.76463 24.1209 5.9129C24.6549 5.0567 25.2873 4.03912 27.175 4.22291" fill="#211915"/>
                        <path d="M12.593 0.897073C13.8343 -0.344646 15.7923 -0.129477 17.0102 0.533969C18.2235 1.19741 19.1041 2.30914 19.7646 3.4881C20.2658 4.38016 20.6686 5.33498 20.8466 6.33463C21.0246 7.33429 20.9684 8.38325 20.5749 9.3291C20.3173 9.9522 19.8957 10.5394 19.2774 10.8577C18.2937 11.3598 17.0665 11.0639 16.0781 10.5708C14.1435 9.60703 12.6118 7.92153 11.8904 5.9536C11.5812 5.11085 11.4126 4.20981 11.5016 3.31775C11.5906 2.42568 11.9513 1.55155 12.593 0.897073Z" fill="#211915"/>
                        <path d="M0.0721693 17.277C-0.115199 18.1601 0.0768548 19.0925 0.479697 19.9039C0.88254 20.7198 1.4868 21.428 2.14259 22.078C3.07475 23.0015 4.16617 23.8397 5.4637 24.167C6.76123 24.4897 8.29765 24.1939 9.12207 23.1763C9.94649 22.1542 9.85749 20.6435 9.19233 19.5184C8.52718 18.3932 7.39828 17.5908 6.22254 16.9498C5.31849 16.4567 4.34417 16.0308 3.30896 15.9367C2.27375 15.8381 1.0418 15.7215 0.0721693 17.277Z" fill="#211915"/>
                        <path d="M5.96487 4.09311C4.18487 4.30828 3.1965 5.94448 3.02787 7.27137C2.85924 8.59826 3.27614 9.9386 3.86635 11.1489C4.31603 12.0679 4.87814 12.9465 5.60887 13.6772C6.34429 14.4079 7.25772 14.9906 8.28356 15.2506C8.95809 15.4255 9.70756 15.4479 10.3399 15.161C11.347 14.7038 11.8295 13.5831 12.0075 12.5296C12.3541 10.4676 11.8482 8.28895 10.6257 6.55861C10.101 5.81896 9.44524 5.15103 8.64424 4.69379C7.84324 4.23655 6.89235 3.98552 5.96487 4.09311Z" fill="#211915"/>
                      </svg>
                      Patient &amp; Energy
                    </p>
                  </div>
                  <div style={{ background: "#FFDCB7", padding: "20px 24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", alignItems: "center" }}>
                      {/* Plain text rows */}
                      {[
                        ["Patient name / ID", profile.dogName || (profile as any).catName || "—"],
                        ["Breed", profile.breed || "Unknown breed"],
                        ["Sex", profile.sex === "M" ? "Male" : "Female"],
                        ["Age", profile.age],
                      ].map(([label, value]) => (
                        <React.Fragment key={String(label)}>
                          <p style={{ fontSize: "16px", fontWeight: 700, color: "#211915", margin: 0 }}>{label}</p>
                          <p style={{ fontSize: "16px", fontWeight: 800, color: "#211915", textAlign: "right", margin: 0 }}>{String(value)}</p>
                        </React.Fragment>
                      ))}
                      {/* Orange bar rows — width now hugs the content instead of a fixed minWidth */}
                      {[
                        ["Body weight (kg)", String(profile.weightKg)],
                        ...(petType === "dog"
                          ? [["Activity Level", String((profile as any).activity ?? "—")]]
                          : []),
                        ["Daily energy need MER (kcal/day)", profile.den.toLocaleString()],
                      ].map(([label, value]) => (
                        <React.Fragment key={String(label)}>
                          <p style={{ fontSize: "16px", fontWeight: 700, color: "#211915", margin: 0 }}>{label}</p>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <div style={{ background: "#FA9A36", borderRadius: "4px", padding: "4px 14px", display: "inline-block", width: "fit-content", textAlign: "right" }}>
                              <span style={{ fontSize: "15px", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{value}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fresh weight batch table */}
                <p className="text-[#143C6F] uppercase" style={{ fontSize: "26px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "10px", marginBottom: "20px", letterSpacing: "0.02em" }}>Fresh weight to serve per batch (g)</p>
                <div className="overflow-x-auto" style={{ marginBottom: "32px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
                    <thead>
                      <tr style={{ background: "#143C6F", color: "#fff" }}>
                        <th style={{ padding: "16px 16px", textAlign: "left", fontSize: "16px", fontWeight: 700, textTransform: "uppercase" }}>Ingredient</th>
                        <th style={{ padding: "16px 10px", textAlign: "center", fontSize: "16px", fontWeight: 700, textTransform: "uppercase" }}>Unit</th>
                        {DAYS.map(d => (
                          <th key={d} style={{ padding: "16px 4px", textAlign: "right", fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap" }}>{d}Days</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shuffledBreakdown.map((r, i) => {
                        if (Number(r.dm_g) <= 0) return null;
                        const frac = Number(r.dm_g) / totalDM;
                        const ingDailyDM = frac * dailyDM;
                        const wf = Number(r.water_percent) / 100;
                        let ingFresh = wf < 1 ? ingDailyDM / (1 - wf) : ingDailyDM;
                        // EXCEPTION: Oyster canned is scaled by 10/14.9 for this batch table only,
                        // matching the same correction applied server-side in diet_router.py.
                        if (r.ingredient.trim().toLowerCase() === "oyster canned") {
                          ingFresh = ingFresh * (10.0 / 14.9);
                        }
                        // EXCEPTION: Liver ingredients are shown at 80% of the
                        // computed fresh-weight value in this final report table.
                        const ingLower = r.ingredient.trim().toLowerCase();
                        if (ingLower.includes("liver")) {
                          ingFresh = ingFresh * 0.8;
                        }
                        return (
                          <tr key={i} style={{ background: "#E0F2FF", borderBottom: "2px solid #3C6293" }}>
                            <td style={{ padding: "12px 16px", fontSize: "16px", fontWeight: 600, color: "#211915" }}>{cleanIngredientName(r.ingredient)}</td>
                            <td style={{ padding: "12px 10px", textAlign: "center", fontSize: "16px", fontWeight: 600, color: "#3C6293" }}>grams</td>
                            {DAYS.map(d => (
                              <td key={d} style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "15px", fontWeight: 600, color: "#211915" }}>{(ingFresh * d).toFixed(1)}</td>
                            ))}
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#143C6F", color: "#fff" }}>
                        <td style={{ padding: "14px 16px", fontSize: "15px", fontWeight: 700 }}>Total (grams)</td>
                        <td style={{ padding: "12px 10px" }}></td>
                        {DAYS.map(d => {
                          const tot = breakdown.reduce((s, r) => {
                            if (Number(r.dm_g) <= 0) return s;
                            const frac = Number(r.dm_g) / totalDM;
                            const wf = Number(r.water_percent) / 100;
                            let ingFresh = wf < 1 ? (frac * dailyDM) / (1 - wf) : frac * dailyDM;
                            // EXCEPTION: Oyster canned is scaled by 10/14.9, matching the
                            // per-row calc above and the server-side correction in diet_router.py.
                            if (r.ingredient.trim().toLowerCase() === "oyster canned") {
                              ingFresh = ingFresh * (10.0 / 14.9);
                            }
                            // EXCEPTION: Liver ingredients are shown at 80% of the
                            // computed fresh-weight value in this final report table.
                            const ingLowerTot = r.ingredient.trim().toLowerCase();
                            if (ingLowerTot.includes("liver")) {
                              ingFresh = ingFresh * 0.8;
                            }
                            return s + ingFresh * d;
                          }, 0);
                          return <td key={d} style={{ padding: "14px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "14px", fontWeight: 600 }}>{tot.toFixed(1)}</td>;
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Diet Nutrient Composition — Dry Matter Basis + Per 1000 Kcal DM */}
                <p className="text-[#143C6F] uppercase" style={{ fontSize: "26px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "10px", marginBottom: "24px", marginTop: "32px", letterSpacing: "0.02em" }}>Diet Nutrient Composition</p>
                <div className="overflow-x-auto rounded-[12px] border border-[#A6CCE8] shadow-sm mb-6">
                  <table className="w-full text-[13px] border-collapse" style={{ tableLayout: "fixed", width: "100%" }}>
                    <thead>
                      <tr className="bg-[#143C6F] text-white">
                        <th className="uppercase tracking-wider" style={{ width: "26%", padding: "16px 16px", textAlign: "left", fontSize: "22px", fontWeight: 800 }}>Nutrient</th>
                        <th className="uppercase tracking-wider" style={{ width: "17%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800 }}>Unit</th>
                        <th className="uppercase tracking-wider" style={{ width: "25%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800, whiteSpace: "nowrap" }}>Dry Matter Basis</th>
                        <th className="uppercase tracking-wider" style={{ width: "32%", padding: "16px 16px", textAlign: "center", fontSize: "22px", fontWeight: 800 }}>Per 1000 Kcal DM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedSections
                        .filter(section => section.rows.some(row => row.val != null))
                        .map(section => (
                        <React.Fragment key={section.cat}>
                          <tr>
                            <td colSpan={4} className="font-black uppercase tracking-wider" style={{ padding: "16px 18px", background: "#BEE2FB", color: "#143C6F", fontSize: "22px", fontWeight: 900, letterSpacing: "0.04em" }}>
                              {section.cat}
                            </td>
                          </tr>
                          {section.rows
                            .filter(row => row.val != null)
                            .map(row => {
                            const perKcalVal = calcPerKcal(
                              row.val,
                              (row as any).perKcal
                            );
                            const perKcalStr = perKcalVal != null ? perKcalVal.toFixed(row.dec ?? 2) : "—";
                            return (
                              <tr key={row.label} className="border-b border-[#A6CCE8] last:border-0 hover:bg-[#FFDCB7]/20 transition">
                                <td style={{ padding: "12px 16px", textAlign: "left", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.label}</td>
                                <td style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.unit}</td>
                                <td className="font-mono font-semibold" style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>
                                  {row.val != null ? Number(row.val).toFixed(row.dec ?? 2) : "—"}
                                </td>
                                <td className="font-mono" style={{ padding: "12px 16px", textAlign: "center", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{perKcalStr}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Print / Save button + Email report — side by side */}
                <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "14px", marginTop: "24px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => window.print()}
                    className="hover:brightness-95 transition"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      background: "#143C6F", color: "#fff",
                      fontWeight: 700, fontSize: "15px",
                      padding: "12px 22px", borderRadius: "10px", border: "none", cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    🖨 Print / Save
                  </button>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "340px" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      background: "#fff", border: "1.5px solid #A6CCE8", borderRadius: "12px",
                      padding: "6px 6px 6px 18px",
                    }}
                  >
                    {emailSent ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", color: "#2E7D32", fontWeight: 700, fontSize: "15px", padding: "10px 4px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Sent — check your inbox
                      </span>
                    ) : (
                      <>
                        <input
                          type="email"
                          value={reportEmail}
                          onChange={e => { setReportEmail(e.target.value); setEmailError(""); }}
                          onKeyDown={e => { if (e.key === "Enter") sendReportEmail(); }}
                          placeholder="Email this report to…"
                          style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: "15px", color: "#211915", fontFamily: "'Parastoo', sans-serif" }}
                        />
                        <button
                          type="button"
                          onClick={sendReportEmail}
                          disabled={!isValidEmail || emailSending}
                          aria-label="Send report by email"
                          className="transition"
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: "42px", height: "42px", borderRadius: "9px", border: "none", flexShrink: 0,
                            background: isValidEmail ? "#FA9A36" : "#FFDCB7",
                            cursor: isValidEmail && !emailSending ? "pointer" : "not-allowed",
                          }}
                        >
                          {emailSending ? (
                            <span style={{ width: "16px", height: "16px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M4 12H20M20 12L14 6M20 12L14 18" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                  {emailError && (
                    <span style={{ color: "#C62828", fontSize: "13px", paddingLeft: "18px" }}>{emailError}</span>
                  )}
                  </div>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </>
            ) : (
              <p className="text-[#3C6293] text-[13px] italic mt-4">Could not calculate feeding plan — diet energy unavailable.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center" style={{ marginTop: "36px" }}>
          <button
            onClick={onGoHome ?? onBack}
            className="bg-[#BEE2FB] text-[#143C6F] transition hover:brightness-95"
            style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "22px", padding: "22px 56px", borderRadius: "14px" }}
          >
            ← Back to Home
          </button>
        </div>

        </div>
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[27px] font-bold uppercase tracking-wide text-[#FF9D36] border-b-[1.5px] border-[#3C6293]"
      style={{ paddingBottom: "10px", marginBottom: "22px", borderBottom: "1.5px solid #3C6293" }}
    >
      {children}
    </div>
  );
}

function Field({
  label, error, children,
}: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[23px] font-bold text-[#3C6293]" style={{ marginBottom: "9px" }}>{label}</label>
      {children}
      {error && <p className="mt-1.5 text-[15px] text-[#AD0B39] font-bold">{error}</p>}
    </div>
  );
}

function PillGroup({
  name, value, options, onChange,
}: {
  name: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2.5">
      {options.map(o => (
        <button
          key={o.value} type="button"
          onClick={() => onChange(value === o.value ? "" : o.value)}
          className={`flex-1 h-[64px] rounded-[10px] text-[21px] font-bold transition-all ${
            value === o.value
              ? "bg-[#143C6F] text-white"
              : "bg-[#E0F2FF] text-[#211915]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Same visual style as PillGroup, but allows multiple options to be
// selected/highlighted at once (e.g. "Neutered" + "Obese" together).
function MultiPillGroup({
  name, value, options, onToggle,
}: {
  name: string; value: string[];
  options: { value: string; label: string }[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex gap-2.5">
      {options.map(o => (
        <button
          key={o.value} type="button"
          aria-pressed={value.includes(o.value)}
          onClick={() => onToggle(o.value)}
          className={`flex-1 h-[64px] rounded-[10px] text-[21px] font-bold transition-all ${
            value.includes(o.value)
              ? "bg-[#143C6F] text-white"
              : "bg-[#E0F2FF] text-[#211915]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function inputCls(error: boolean, centered: boolean = false) {
  return `w-full h-[64px] px-4 rounded-[10px] text-[21px] font-bold text-[#211915] bg-[#E0F2FF] outline-none transition-all ${
    centered ? "text-center" : ""
  } ${
    error ? "shadow-[0_0_0_2px_#B02424]" : "focus:shadow-[0_0_0_2px_#3C6293]"
  }`;
}

// Two dropdowns (Years 1–30, Months 1–12) that sit under an Age text field
// and auto-fill it whenever either selection changes.
function AgeYearMonthPicker({
  years, months, onYearsChange, onMonthsChange,
}: {
  years: string; months: string;
  onYearsChange: (v: string) => void;
  onMonthsChange: (v: string) => void;
}) {
  const selectCls = `${inputCls(false, true)} appearance-none cursor-pointer`;
  const optionStyle = { fontWeight: 700, fontSize: "21px", color: "#211915" };
  return (
    <div className="grid grid-cols-2" style={{ gap: "16px", marginTop: "4px" }}>
      <Field label="Years">
        <select
          value={years}
          onChange={e => onYearsChange(e.target.value)}
          className={selectCls}
          style={{ fontWeight: 700, fontSize: "21px" }}
        >
          <option value="" style={{ ...optionStyle, color: "#3C6293" }}>— Years —</option>
          {Array.from({ length: 30 }, (_, i) => i + 1).map(y => (
            <option key={y} value={y} style={optionStyle}>{y}</option>
          ))}
        </select>
      </Field>
      <Field label="Months">
        <select
          value={months}
          onChange={e => onMonthsChange(e.target.value)}
          className={selectCls}
          style={{ fontWeight: 700, fontSize: "21px" }}
        >
          <option value="" style={{ ...optionStyle, color: "#3C6293" }}>— Months —</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m} style={optionStyle}>{m}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// Builds the "3 years 8 months" style string from the two dropdown values.
function formatAgeFromParts(years: string, months: string) {
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === "1" ? "" : "s"}`);
  if (months) parts.push(`${months} month${months === "1" ? "" : "s"}`);
  return parts.join(" ");
}


// ─── Checkout: Unlock Daily Feeding Plan ──────────────────────────────────────
// Flow: pay-gate → customer profile → liability disclaimer (must scroll + accept)
// → payment details → user clicks "Pay Now" to submit the charge → plan unlocks.
type CheckoutStage = "gate" | "customer" | "disclaimer" | "payment" | "success";

interface CustomerInfo {
  fullName: string;
  email: string;
  confirmEmail: string;
}

const PLAN_PRICE_LABEL = "$14.49";

function CustomerProfileForm({
  onNext,
}: {
  onNext: (info: CustomerInfo) => void;
}) {
  const [form, setForm] = useState<CustomerInfo>({ fullName: "", email: "", confirmEmail: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(k: keyof CustomerInfo, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Please enter your full name.";
    if (!form.email.trim()) e.email = "Please enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Please enter a valid email address.";
    if (!form.confirmEmail.trim()) e.confirmEmail = "Please re-enter your email address.";
    else if (form.confirmEmail.trim() !== form.email.trim()) e.confirmEmail = "Email addresses do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onNext(form);
  }

  return (
    <div className="border-[1.5px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ marginTop: "16px" }}>
      <div className="bg-[#143C6F]" style={{ padding: "22px 28px" }}>
        <p className="text-white font-bold" style={{ fontFamily: "'Parastoo', sans-serif", fontSize: "20px" }}>Customer Profile</p>
        <p className="text-[#FFC588] font-semibold" style={{ fontSize: "14px", marginTop: "4px" }}>Tell us who's unlocking this feeding plan.</p>
      </div>
      <div className="bg-white" style={{ padding: "28px" }}>
        <div className="space-y-4" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Field label="Full Name *" error={errors.fullName}>
            <input className={inputCls(!!errors.fullName)} value={form.fullName}
              onChange={e => set("fullName", e.target.value)} placeholder="e.g. Jamie Rivera" />
          </Field>
          <Field label="Email Address *" error={errors.email}>
            <input type="email" className={inputCls(!!errors.email)} value={form.email}
              onChange={e => set("email", e.target.value)} placeholder="e.g. jamie@example.com" />
          </Field>
          <Field label="Confirm Email Address *" error={errors.confirmEmail}>
            <input type="email" className={inputCls(!!errors.confirmEmail)} value={form.confirmEmail}
              onChange={e => set("confirmEmail", e.target.value)}
              onPaste={e => e.preventDefault()}
              placeholder="Re-enter your email address" />
          </Field>
        </div>
        <button
          onClick={submit}
          className="w-full bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all"
          style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "16px", padding: "16px 24px", borderRadius: "12px", marginTop: "24px" }}
        >
          Continue to Payment →
        </button>
      </div>
    </div>
  );
}

function DisclaimerAccept({
  onBack,
  onAccept,
}: {
  onBack: () => void;
  onAccept: () => void;
}) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    if (atBottom) setScrolledToEnd(true);
  }

  const canAccept = scrolledToEnd && checked;

  return (
    <div className="border-[1.5px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ marginTop: "16px" }}>
      <div className="bg-[#143C6F]" style={{ padding: "22px 28px" }}>
        <p className="text-white font-bold" style={{ fontFamily: "'Parastoo', sans-serif", fontSize: "20px" }}>Liability Disclaimer</p>
        <p className="text-[#FFC588] font-semibold" style={{ fontSize: "14px", marginTop: "4px" }}>
          {scrolledToEnd ? "You've reached the end — please review and accept below." : "Please scroll to the bottom to continue."}
        </p>
      </div>
      <div className="bg-white" style={{ padding: "28px" }}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="bg-[#F4F4F4] border-[1.5px] border-[#A6CCE8] rounded-[10px]"
          style={{ padding: "24px", height: "340px", overflowY: "auto" }}
        >
          {DISCLAIMER_ITEMS.map((item, i) => {
            if (item.type === "title") {
              return (
                <p key={i} className="text-[#143C6F]" style={{ fontFamily: "'Times New Roman', Times, serif", fontWeight: 700, fontSize: "16px", lineHeight: "1.15", textTransform: "uppercase", letterSpacing: "0.01em", marginBottom: "8px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "meta") {
              return (
                <p key={i} className="text-[#211915]" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "13px", lineHeight: "1.15", fontStyle: "italic", marginBottom: "10px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "important") {
              return (
                <p key={i} className="text-[#211915]" style={{ fontFamily: "'Times New Roman', Times, serif", fontWeight: 700, fontSize: "13px", lineHeight: "1.15", textTransform: "uppercase", marginBottom: "10px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "heading") {
              return (
                <p key={i} className="text-[#211915]" style={{ fontFamily: "'Times New Roman', Times, serif", fontWeight: 700, fontSize: "13px", lineHeight: "1.15", marginTop: "10px", marginBottom: "4px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "shout") {
              return (
                <p key={i} className="text-[#211915] uppercase" style={{ fontFamily: "'Times New Roman', Times, serif", fontWeight: 700, fontSize: "13px", lineHeight: "1.15", marginBottom: "4px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "bullet") {
              return (
                <p key={i} className="text-[#211915]" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "13px", lineHeight: "1.15", marginBottom: "4px", paddingLeft: "16px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0 }}>•</span>{item.text}
                </p>
              );
            }
            return (
              <p key={i} className="text-[#211915]" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "13px", lineHeight: "1.15", marginBottom: "4px" }}>
                {item.text}
              </p>
            );
          })}
        </div>

        <label className="flex items-start" style={{ gap: "10px", marginTop: "18px", cursor: scrolledToEnd ? "pointer" : "not-allowed", opacity: scrolledToEnd ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!scrolledToEnd}
            onChange={e => setChecked(e.target.checked)}
            style={{ marginTop: "3px", width: "18px", height: "18px", accentColor: "#143C6F" }}
          />
          <span className="text-[#211915] font-semibold" style={{ fontSize: "14px", lineHeight: 1.5 }}>
            I have read and agree to the FurTuner Liability Disclaimer and Limitation of Liability.
          </span>
        </label>

        <div className="flex" style={{ gap: "12px", marginTop: "22px" }}>
          <button
            onClick={onBack}
            className="text-[#3C6293] font-bold"
            style={{ fontSize: "15px", padding: "16px 20px", borderRadius: "12px", border: "1.5px solid #A6CCE8", background: "white" }}
          >
            ← Back
          </button>
          <button
            onClick={onAccept}
            disabled={!canAccept}
            className="flex-1 text-white transition-all"
            style={{
              fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "16px",
              padding: "16px 24px", borderRadius: "12px",
              background: canAccept ? "#143C6F" : "#A6CCE8",
              cursor: canAccept ? "pointer" : "not-allowed",
            }}
          >
            Accept &amp; Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

function StripeCheckoutPanel({
  customer,
  onBack,
  onContinue,
  onSkip,
  redirecting,
}: {
  customer: CustomerInfo;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  redirecting: boolean;
}) {
  // Only shows the "Skip Payment (Testing)" button when the page is
  // visited with ?testmode=7d2132eae669 in the URL — real customers
  // visiting furtuner.com normally never see it. Use
  // https://furtuner.com/?testmode=7d2132eae669 to test the flow.
  // (This value is only as secret as the deployed JS bundle it lives in —
  // anyone determined enough to read the site's minified JS could find
  // it, same as any other client-side check. It just isn't something a
  // casual visitor would stumble on or guess.)
  const testMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("testmode") === "7d2132eae669";

  return (
    <div className="border-[1.5px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ marginTop: "16px" }}>
      <div className="bg-[#143C6F]" style={{ padding: "22px 28px" }}>
        <p className="text-white font-bold" style={{ fontFamily: "'Parastoo', sans-serif", fontSize: "20px" }}>Payment</p>
        <p className="text-[#FFC588] font-semibold" style={{ fontSize: "14px", marginTop: "4px" }}>Daily Feeding Plan — {PLAN_PRICE_LABEL}</p>
      </div>
      <div className="bg-white" style={{ padding: "28px" }}>
        <div className="rounded-[10px] bg-[#F4F4F4]" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div className="flex justify-between" style={{ fontSize: "15px" }}>
            <span className="text-[#211915]">Name</span>
            <span className="font-semibold text-[#143C6F]">{customer.fullName}</span>
          </div>
          <div className="flex justify-between" style={{ fontSize: "15px" }}>
            <span className="text-[#211915]">Email</span>
            <span className="font-semibold text-[#143C6F]">{customer.email}</span>
          </div>
          <div className="flex justify-between" style={{ fontSize: "15px" }}>
            <span className="text-[#211915]">Total</span>
            <span className="font-semibold text-[#143C6F]">{PLAN_PRICE_LABEL}</span>
          </div>
        </div>
        <p className="text-[#211915]" style={{ fontSize: "13px", marginTop: "16px", lineHeight: 1.5 }}>
          You'll be taken to Stripe's secure checkout to enter your card details. FurTuner never sees or stores your card information.
        </p>

        <div className="flex" style={{ gap: "12px", marginTop: "24px" }}>
          <button
            onClick={onBack}
            disabled={redirecting}
            className="text-[#3C6293] font-bold"
            style={{ fontSize: "15px", padding: "16px 20px", borderRadius: "12px", border: "1.5px solid #A6CCE8", background: "white", opacity: redirecting ? 0.5 : 1 }}
          >
            ← Back
          </button>
          <button
            onClick={() => onContinue()}
            disabled={redirecting}
            className="flex-1 bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all flex items-center justify-center"
            style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "16px", padding: "16px 24px", borderRadius: "12px", gap: "10px" }}
          >
            {redirecting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Redirecting to Stripe…
              </>
            ) : (
              `Continue to Secure Payment (${PLAN_PRICE_LABEL}) →`
            )}
          </button>
        </div>

        {testMode && (
          <button
            onClick={() => onSkip()}
            disabled={redirecting}
            className="w-full text-[#3C6293] font-semibold"
            style={{ fontSize: "13px", padding: "10px", marginTop: "12px", borderRadius: "10px", border: "1px dashed #A6CCE8", background: "white", opacity: redirecting ? 0.5 : 1 }}
          >
            Skip Payment (Testing)
          </button>
        )}
      </div>
    </div>
  );
}

function CheckoutFlow({
  onUnlock,
  petType,
  dietType,
  profile,
  selectedIngredients,
  result,
  allIngredients,
}: {
  onUnlock: () => void;
  petType: PetType;
  dietType: DietType;
  profile: unknown;
  selectedIngredients: string[];
  result: CalcResult | null;
  allIngredients: IngredientItem[];
}) {
  const [stage, setStage] = useState<CheckoutStage>("gate");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  function goToStripeCheckout(linkOverride?: string) {
    if (!customer) return;
    setRedirecting(true);

    // Persist everything needed to restore this exact wizard state once the
    // user comes back from Stripe's hosted checkout (a full-page redirect
    // wipes React state, since there's no backend session here).
    try {
      sessionStorage.setItem(
        CHECKOUT_STORAGE_KEY,
        JSON.stringify({ petType, dietType, profile, selectedIngredients, result, allIngredients, customer })
      );
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — payment still
      // works, the user just won't auto-return to an unlocked plan.
    }

    const url = new URL(linkOverride ?? STRIPE_PAYMENT_LINK);
    if (customer.email) url.searchParams.set("prefilled_email", customer.email);
    // client_reference_id isn't required for the Sheet logging anymore
    // (name/email are read back from sessionStorage instead, see
    // logPaidCustomerToSheet below) — left in place since it's still a
    // handy way to see the customer's name against a session in the
    // Stripe Dashboard itself.
    if (customer.fullName) url.searchParams.set("client_reference_id", customer.fullName);
    // Stripe's Payment Link "after payment" redirect (set in the Stripe
    // Dashboard for this link) should point back to this page with
    // ?paw_payment=success so the app knows to unlock the plan on return.
    window.location.href = url.toString();
  }

  if (stage === "gate") {
    return (
      <div className="bg-[#FFDCB7] border-[1.5px] border-[#FFB160] rounded-[12px] flex flex-col sm:flex-row items-center justify-between" style={{ padding: "28px 32px", gap: "20px", marginTop: "16px" }}>
        <div>
          <p className="font-bold text-[#143C6F]" style={{ fontSize: "32px" }}>Get Your Daily Feeding Plan</p>
        </div>
        <button
          onClick={() => setStage("customer")}
          className="bg-[#143C6F] hover:bg-[#FF9D36] text-white transition whitespace-nowrap shrink-0"
          style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "28px", padding: "18px 44px", borderRadius: "12px" }}
        >
          PAY
        </button>
      </div>
    );
  }

  if (stage === "customer") {
    return (
      <CustomerProfileForm
        onNext={info => { setCustomer(info); setStage("disclaimer"); }}
      />
    );
  }

  if (stage === "disclaimer") {
    return (
      <DisclaimerAccept
        onBack={() => setStage("customer")}
        onAccept={() => setStage("payment")}
      />
    );
  }

  // stage === "payment" — the actual "unlock" happens when the user returns
  // from Stripe with ?paw_payment=success (handled by the parent).
  return (
    <StripeCheckoutPanel
      customer={customer!}
      onBack={() => setStage("disclaimer")}
      onContinue={goToStripeCheckout}
      redirecting={redirecting}
      onSkip={() => {
        // TESTING ONLY: bypasses the actual Stripe redirect but still logs
        // the customer to the Sheet exactly like a real return-from-Stripe
        // would, so the Sheet recording itself can be verified end-to-end.
        // Remove this before sending real customers through the flow.
        logPaidCustomerToSheet(customer, petType, dietType);
        onUnlock();
      }}
    />
  );
}

// ─── buildProfile ─────────────────────────────────────────────────────────────
function buildProfile(form: ProfileData) {
  const wkg = parseFloat(form.weightKg);
  const base = 70 * Math.pow(wkg, 0.75);
  const baseDen = form.repro === "Intact" ? Math.round(base * 1.8) : Math.round(base * 1.6);
  const actMult = ACTIVITY_MULTIPLIER[form.activity] ?? 0;
  const finalDen = Math.round(baseDen * (1 + actMult));
  return {
    dogName:        form.dogName.trim(),
    breed:          form.breed.trim(),
    age:            form.age.trim(),
    sex:            form.sex,
    repro:          form.repro,
    activity:       form.activity,
    weightKg:       parseFloat(wkg.toFixed(2)),
    weightDisplay:  `${form.weightKg} kg / ${form.weightLb} lb`,
    den:            finalDen,
    rer:            Math.round(base),
    activityFactor: parseFloat((1 + actMult).toFixed(2)),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DogDietCalculator({ visible, onGoHome }: { visible: boolean; onGoHome?: () => void }) {
  const [petType, setPetType] = useState<PetType | null>(null);
  const [dietType, setDietType] = useState<DietType | null>(null);
  // page 1 = Start, 2 = Choose Pet Type, 3 = Choose Diet Type,
  // 4 = Profile, 5 = Ingredients, 6 = Results
  const [page, setPage] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [profile, setProfile] = useState<ReturnType<typeof buildProfile> | ReturnType<typeof buildCatProfile> | null>(null);
  // Raw form field values (as typed), kept separately from the computed `profile`
  // above, so that navigating Ingredients -> back -> Profile re-populates the
  // form instead of showing it blank. Cleared on full reset/go-home/pet-switch.
  const [dogProfileDraft, setDogProfileDraft] = useState<ProfileData | null>(null);
  const [catProfileDraft, setCatProfileDraft] = useState<CatProfileData | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [allIngredients, setAllIngredients] = useState<IngredientItem[]>([]);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [savedSelected, setSavedSelected] = useState<string[]>([]);
  const [calcErrors, setCalcErrors] = useState<string>("");
  const [restoredFeedPlanUnlocked, setRestoredFeedPlanUnlocked] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const apiKey = `${petType}_${dietType}`;
  const API_BASE = API_BASES[apiKey] ?? "http://localhost:8000";

  function scrollToTop() {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // On mount: if this is a return trip from Stripe's hosted checkout
  // (?paw_payment=success), restore the wizard state we saved before
  // redirecting and jump straight to an unlocked Results page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(STRIPE_RETURN_PARAM) !== "success") return;

    try {
      const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.petType) setPetType(saved.petType);
        if (saved.dietType) setDietType(saved.dietType);
        if (saved.profile) setProfile(saved.profile);
        if (saved.selectedIngredients) setSelectedIngredients(saved.selectedIngredients);
        if (saved.result) setResult(saved.result);
        if (saved.allIngredients) setAllIngredients(saved.allIngredients);
        setPage(6);
        setRestoredFeedPlanUnlocked(true);
        // This IS "landing on the report" — log the paid customer's
        // name/email to the Sheet right here, once, before we clear the
        // sessionStorage key below (which also doubles as our guard
        // against logging twice on a refresh, since the key is gone by
        // the next mount).
        logPaidCustomerToSheet(saved.customer ?? null, saved.petType ?? null, saved.dietType ?? null);
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      }
    } catch {
      // Corrupt/missing sessionStorage — payment likely still succeeded on
      // Stripe's side, but we can't safely restore the wizard here.
    }

    // Strip the query param so a refresh doesn't re-trigger this.
    params.delete(STRIPE_RETURN_PARAM);
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function handleCalculate(ingredients: string[]) {
    setSelectedIngredients(ingredients);
    setPage(6);
    setResult(null);
    setCalcErrors("");
    scrollToTop();

    // Avoid a jarring flash for fast responses: only actually show the
    // "Calculating…" message if the request is still in flight after
    // 300ms. Most calculations finish faster than that, so the result
    // just appears with no visible loading state at all; slower ones
    // still get a proper, readable loading message instead of a flicker.
    let loadingShown = false;
    const loadingTimer = setTimeout(() => {
      loadingShown = true;
      setCalculating(true);
    }, 300);

    try {
      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients, diet_type: dietType }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const errorIssues = (data.issues ?? []).filter((i: string) => i.startsWith("ERROR"));
      if (errorIssues.length > 0) {
        setCalcErrors(errorIssues.map((i: string) => i.replace(/^ERROR:\s*/, "")).join(" "));
        setPage(5);
        clearTimeout(loadingTimer);
        if (loadingShown) setCalculating(false);
        return;
      }
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ issues: [`Calculation failed: ${msg}`] } as CalcResult);
    }
    clearTimeout(loadingTimer);
    if (loadingShown) setCalculating(false);
  }

  // "Start Over" from the Results page — restarts the current pet/diet's wizard from the Profile step
  function reset() {
    setPage(4);
    setProfile(null);
    setDogProfileDraft(null);
    setCatProfileDraft(null);
    setResult(null);
    setSelectedIngredients([]);
    setSavedSelected([]);
    setCalcErrors("");
    scrollToTop();
  }

  // Returns all the way to the Start screen — the only place the
  // pet-type / diet-type selection screens are shown again
  function goHome() {
    setPage(1);
    setProfile(null);
    setDogProfileDraft(null);
    setCatProfileDraft(null);
    setResult(null);
    setSelectedIngredients([]);
    setSavedSelected([]);
    setCalcErrors("");
    setDietType(null);
    scrollToTop();
  }

  function startWizard() {
    setPage(2);
    scrollToTop();
  }

  function selectPet(type: PetType) {
    setPetType(type);
    setDietType(null);
  }

  function goToDietStep() {
    setPage(3);
    setProfile(null);
    setDogProfileDraft(null);
    setCatProfileDraft(null);
    setResult(null);
    setSelectedIngredients([]);
    setCalcErrors("");
    scrollToTop();
  }

  function selectDiet(type: DietType) {
    setDietType(type);
    // Kick off the ingredients fetch now, right when the diet is chosen —
    // the user still has to fill out the whole profile form before
    // reaching the Ingredients page, so by the time they get there this
    // has usually already finished and there's no loading flash.
    const prefetchKey = `${petType}_${type}`;
    const prefetchBase = API_BASES[prefetchKey];
    if (prefetchBase) {
      prefetchIngredients(prefetchBase).catch(() => {
        // Swallow here — if this fails, the Ingredients page's own fetch
        // will retry and surface a proper error message when it's reached.
      });
    }
  }

  function goToProfileStep() {
    setPage(4);
    setProfile(null);
    setDogProfileDraft(null);
    setCatProfileDraft(null);
    setResult(null);
    setSelectedIngredients([]);
    setCalcErrors("");
    scrollToTop();
  }

  const dietLabel = petType === "cat"
    ? CAT_DIETS.find(d => d.value === dietType)?.label.toLowerCase() ?? "conventional"
    : DOG_DIETS.find(d => d.value === dietType)?.label.toLowerCase() ?? "conventional";

  if (!visible) return null;

  return (
    <section id="calculator" className="bg-[#F4F4F4] py-[120px]" ref={sectionRef} style={{ animation: "dietBoxIn 0.45s ease both", maxWidth: "1280px", margin: "0 auto", paddingTop: "120px", paddingBottom: "120px" }}>
      <style>{`
        @keyframes dietBoxIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="mx-auto max-w-[1280px] px-[90px]" style={{ maxWidth: "1280px", margin: "0 auto", paddingLeft: "90px", paddingRight: "90px", width: "100%" }}>
        {/* Step indicator for the 5 numbered steps; the Results page has none */}
        {page <= 5 && <StepIndicator step={page as 1 | 2 | 3 | 4 | 5} />}

        {/* Step 1: Start — kicks off the wizard */}
        {page === 1 && (
          <div className="text-center" style={{ textAlign: "center", padding: "24px 0 8px", animation: "dietBoxIn 0.4s ease both" }}>
            <p
              className="text-[#DE7100] font-bold"
              style={{ fontFamily: "'Kyiv Type Titling', sans-serif", fontSize: "15px", letterSpacing: "1.5px", marginBottom: "18px" }}
            >
              SCIENCE-BASED PET NUTRITION
            </p>
            <h2
              className="text-[#143C6F]"
              style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 4.6vw, 50px)", lineHeight: 1.2, marginBottom: "18px" }}
            >
              Let's Build Your Pet's Diet
            </h2>
            <p
              className="text-[#211915] mx-auto"
              style={{ fontSize: "18px", lineHeight: 1.6, maxWidth: "560px", marginLeft: "auto", marginRight: "auto", marginBottom: "40px" }}
            >
              In a few quick steps we'll put together a complete, AAFCO-compliant homemade recipe tailored to your dog or cat.
            </p>
            <button
              type="button"
              onClick={startWizard}
              className="bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all"
              style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "20px", padding: "20px 56px", borderRadius: "999px", boxShadow: "0_0_0_5px_#E0F2FF" }}
            >
              Start →
            </button>
          </div>
        )}

        {/* Step 2: Choose Your Pet Type — only shown on this step, unless the user goes back to Home */}
        {page === 2 && (
          <div className="text-center mb-10" style={{ textAlign: "center", marginBottom: "48px", animation: "dietBoxIn 0.4s ease both" }}>
            <p
              className="text-[#143C6F]"
              style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(28px, 3.5vw, 38px)", fontWeight: 700, marginBottom: "40px" }}
            >
              Choose Your Pet Type
            </p>
            <div className="flex justify-center gap-4">
              {(["dog", "cat"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectPet(t)}
                  className={`font-bold rounded-full border-2 transition-all ${
                    petType === t
                      ? "bg-[#3C6293] border-[#3C6293] text-white shadow-[0_0_0_5px_#E0F2FF]"
                      : "border-[#A6CCE8] text-[#211915] bg-white hover:border-[#3C6293]"
                  }`}
                  style={{ fontSize: "22px", padding: "18px 50px" }}
                >
                  {t === "dog" ? "Dogs" : "Cats"}
                </button>
              ))}
            </div>
            <div className="flex justify-center items-center gap-3" style={{ marginTop: "28px" }}>
              <button
                type="button"
                onClick={() => { setPage(1); scrollToTop(); }}
                className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goToDietStep}
                disabled={!petType}
                className={`transition ${
                  petType
                    ? "bg-[#143C6F] hover:bg-[#FF9D36] text-white"
                    : "bg-[#E5E5E5] text-[#9A9A9A] cursor-not-allowed"
                }`}
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Choose the Type of Diet — only shown on this step, unless the user goes back to Home */}
        {page === 3 && (
          <div className="text-center mb-10" style={{ textAlign: "center", marginBottom: "48px", animation: "dietBoxIn 0.4s ease both" }}>
            <p
              style={{
                fontFamily: "'Marcellus', serif",
                fontWeight: 700,
                fontSize: "clamp(26px, 3.2vw, 36px)",
                color: "#DE7100",
                marginBottom: "24px",
              }}
            >
              Choose the Type of Diet
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              {(petType === "dog" ? DOG_DIETS : CAT_DIETS).map((d, i) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => selectDiet(d.value)}
                  className={`font-bold rounded-full border-2 transition-all ${
                    dietType === d.value
                      ? "bg-[#143C6F] border-[#143C6F] text-white"
                      : "border-[#A6CCE8] text-[#211915] bg-white hover:border-[#143C6F]"
                  }`}
                  style={{
                    fontSize: "22px",
                    padding: "17px 38px",
                    animation: `dietBoxIn 0.4s ease ${i * 0.12}s both`,
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex justify-center items-center gap-3" style={{ marginTop: "28px" }}>
              <button
                type="button"
                onClick={() => { setPage(2); scrollToTop(); }}
                className="bg-white border-[1.5px] border-[#A6CCE8] text-[#143C6F] hover:border-[#143C6F] transition"
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goToProfileStep}
                disabled={!dietType}
                className={`transition ${
                  dietType
                    ? "bg-[#143C6F] hover:bg-[#FF9D36] text-white"
                    : "bg-[#E5E5E5] text-[#9A9A9A] cursor-not-allowed"
                }`}
                style={{
                  fontFamily: "'Parastoo', sans-serif",
                  fontWeight: 700,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Steps 4–6: Profile, Ingredients, Results — pet/diet selection UI never shows here */}
        {page >= 4 && (
          <>
            <div className="text-center" style={{ textAlign: "center", marginBottom: "40px" }}>
              {page === 4 && (
                <h2
                  className="text-[#143C6F] font-normal"
                  style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 4.6vw, 52px)", lineHeight: 1.2, textAlign: "center" }}
                >
                  Build your {petType}&rsquo;s {dietLabel} diet
                </h2>
              )}
            </div>

            <div className="shadow-[0_8px_48px_rgba(28,24,20,0.13)] rounded-[16px]">
              {page === 4 && petType === "dog" && (
                <ProfilePage
                  initialValues={dogProfileDraft ?? undefined}
                  dietType={dietType}
                  onSelectPet={selectPet}
                  onSelectDiet={selectDiet}
                  onBack={() => { setPage(3); scrollToTop(); }}
                  onNext={(raw, p) => {
                    setDogProfileDraft(raw);
                    setProfile(p);
                    setPage(5);
                    scrollToTop();
                  }}
                />
              )}
              {page === 4 && petType === "cat" && (
                <CatProfilePage
                  initialValues={catProfileDraft ?? undefined}
                  dietType={dietType}
                  onSelectPet={selectPet}
                  onSelectDiet={selectDiet}
                  onBack={() => { setPage(3); scrollToTop(); }}
                  onNext={(raw, p) => {
                    setCatProfileDraft(raw);
                    setProfile(p);
                    setPage(5);
                    scrollToTop();
                  }}
                />
              )}
              {page === 5 && (
                <IngredientsPage
                  onBack={() => { setPage(4); scrollToTop(); }}
                  onCalculate={handleCalculate}
                  onIngredientsLoaded={setAllIngredients}
                  apiBase={API_BASE}
                  initialSelected={savedSelected}
                  onSelectionChange={(s) => { setSavedSelected(s); setCalcErrors(""); }}
                  serverError={calcErrors}
                  dietType={dietType}
                  petType={petType}
                />
              )}
              {page === 6 && profile && (
                <ResultsPage
                  profile={profile}
                  result={calculating ? null : result}
                  selectedIngredients={selectedIngredients}
                  allIngredients={allIngredients}
                  onBack={() => { setPage(5); scrollToTop(); }}
                  onGoHome={onGoHome}
                  onReset={reset}
                  petType={petType as PetType}
                  dietType={dietType as DietType}
                  initialFeedPlanUnlocked={restoredFeedPlanUnlocked}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default DogDietCalculator;
