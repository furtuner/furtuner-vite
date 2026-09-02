"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
interface IngredientItem {
  ingredient_name: string;
  group_name: string;
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
  dog_conventional: "http://localhost:8080",
  cat_conventional: "http://localhost:8000",
  dog_grainfree:    "http://localhost:8004",
  dog_raw:          "http://localhost:8005",
  cat_grainfree:    "http://localhost:8001",
  cat_raw:          "http://localhost:8002",
};

// Stripe-hosted checkout page. Redirecting here means the actual card fields
// are handled entirely by Stripe — this app never sees card data.
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/cNidR1gYd815e2l8jQ7Re00";
// Query param Stripe's "after payment" redirect appends back to this app so
// we know to unlock the feeding plan when the user returns.
const STRIPE_RETURN_PARAM = "paw_payment";
// sessionStorage key used to restore the wizard (pet/diet/profile/results)
// after the full-page redirect to Stripe and back.
const CHECKOUT_STORAGE_KEY = "pawBalancerCheckout";


const CAT_DIETS: { value: DietType; label: string; emoji: string }[] = [
  { value: "conventional", label: "Conventional", emoji: "🥩" },
  { value: "grainfree",    label: "Grain-Free",   emoji: "🥦" },
  { value: "raw",          label: "Meat Based",   emoji: "🦴" },
];

const DOG_DIETS: { value: DietType; label: string; emoji: string }[] = [
  { value: "conventional", label: "Conventional", emoji: "🥩" },
  { value: "grainfree",    label: "Grain-Free",   emoji: "🥦" },
  { value: "raw",          label: "Meat Based",   emoji: "🦴" },
];

// Display-name overrides — shows a nicer/corrected label without changing
// the underlying value used for selection/toggling logic
const INGREDIENT_DISPLAY_OVERRIDES: Record<string, string> = {
  "Eggshells": "Eggshells \"Powder\"",
};

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
  "02 Meat Group B (Optional - Pick up to one)": 1,
  "03 Meat Group C (Optional - Pick up to one)": 1,
  "04 Organ Meat - Other (Optional - Pick up to one)": 1,
  "05 Organ Meat - Liver (Mandatory - Select one)": 1,
  "07 Grain B (Optional - Pick up to one)": 1,
  "09 Vegetable B (Optional - Pick up to two)": 2,
  "11 Fruit (Optional - Up to two maximum)": 2,
  // ── Cat Grain-Free ──
  "06 Grain A (Mandatory - Select at least one and a maximum of three, fixed at 110g) [Quinoa, Tapioca, Potatoes, Sweet Potatoes]": 3,
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
  "10 Oil (Mandatory - Select at least one and a maximum of three)": 3,
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
  { type: "title", text: "PAW-BALANCER LIABILITY DISCLAIMER AND LIMITATION OF LIABILITY" },
  { type: "meta", text: "Last Updated: [10/1/2026]" },
  { type: "important", text: "IMPORTANT: PLEASE READ THIS DISCLAIMER CAREFULLY BEFORE USING PAW-BALANCER OR FEEDING ANY DIET GENERATED THROUGH THE PLATFORM." },
  { type: "heading", text: "PURPOSE OF THE PLATFORM" },
  { type: "para", text: "Paw-Balancer is a diet formulation platform designed to assist pet owners in formulating homemade diets for healthy adult dogs and cats. The information, recommendations, nutrient analyses, and recipes generated by Paw-Balancer are provided for informational and educational purposes only and are not intended to replace professional veterinary care, diagnosis, treatment, or nutritional consultation." },
  { type: "para", text: "By using Paw-Balancer, you acknowledge and agree that you are solely responsible for evaluating the suitability of any diet generated by the platform for your individual pet." },
  { type: "heading", text: "HEALTHY ADULT PETS ONLY" },
  { type: "bullet", text: "Paw-Balancer is intended exclusively for healthy adult dogs and cats." },
  { type: "para", text: "The platform is not intended for:" },
  { type: "bullet", text: "Puppies, kittens, pregnant animals, or lactating animals." },
  { type: "bullet", text: "Senior pets with special nutritional needs." },
  { type: "bullet", text: "Pets with medical conditions, diseases, allergies, sensitivities, or metabolic disorders." },
  { type: "bullet", text: "Pets receiving veterinary treatment or therapeutic diets." },
  { type: "para", text: "Users are responsible for consulting with their veterinarian before feeding any diet generated through the platform to pets with any health condition or special nutritional requirement." },
  { type: "heading", text: "NUTRIENT DATABASE LIMITATIONS" },
  { type: "para", text: "Paw-Balancer formulates diets using nutrient composition data obtained primarily from the United States Department of Agriculture (USDA) FoodData Central database and other recognized nutrient databases when applicable." },
  { type: "para", text: "Users acknowledge that actual nutrient composition of foods may vary substantially from database values due to factors including but not limited to:" },
  { type: "bullet", text: "Geographic origin." },
  { type: "bullet", text: "Crop variety or animal breed." },
  { type: "bullet", text: "Seasonal variations." },
  { type: "bullet", text: "Agricultural practices." },
  { type: "bullet", text: "Storage conditions." },
  { type: "bullet", text: "Manufacturing methods." },
  { type: "bullet", text: "Processing techniques." },
  { type: "bullet", text: "Cooking temperature." },
  { type: "bullet", text: "Cooking duration." },
  { type: "bullet", text: "Moisture loss during cooking." },
  { type: "bullet", text: "Supplier differences." },
  { type: "para", text: "Accordingly, Paw-Balancer does not guarantee that the actual nutrient content of any prepared diet will exactly match the nutrient analysis displayed by the platform." },
  { type: "heading", text: "PREPARATION AND MIXING RESPONSIBILITY" },
  { type: "para", text: "The accuracy and nutritional adequacy of a generated recipe depend upon the user's ability to:" },
  { type: "bullet", text: "Select ingredients correctly." },
  { type: "bullet", text: "Purchase ingredients matching those specified." },
  { type: "bullet", text: "Accurately weigh and measure ingredients." },
  { type: "bullet", text: "Follow preparation instructions." },
  { type: "bullet", text: "Properly cook ingredients." },
  { type: "bullet", text: "Properly mix all ingredients." },
  { type: "bullet", text: "Properly store ingredients." },
  { type: "para", text: "Paw-Balancer assumes no responsibility for errors, omissions, substitutions, ingredient changes, inaccurate measurements, preparation mistakes, mixing errors, contamination, spoilage, storage failures, or deviations from the generated recipe." },
  { type: "para", text: "Any modification made by the user may alter the nutritional adequacy of the diet." },
  { type: "heading", text: "NO GUARANTEE OF OUTCOMES" },
  { type: "para", text: "Paw-Balancer makes no representation or warranty that any diet generated by the platform will:" },
  { type: "bullet", text: "Prevent disease." },
  { type: "bullet", text: "Treat disease." },
  { type: "bullet", text: "Cure disease." },
  { type: "bullet", text: "Improve health." },
  { type: "bullet", text: "Produce specific health outcomes." },
  { type: "bullet", text: "Be suitable for every individual pet." },
  { type: "para", text: "Individual animals may respond differently to identical diets due to genetics, health status, lifestyle, environment, metabolism, and numerous other factors beyond the control of Paw-Balancer." },
  { type: "heading", text: "MONITORING OF PET HEALTH" },
  { type: "para", text: "Pet owners are solely responsible for monitoring their pet's health and response to any diet generated through Paw-Balancer." },
  { type: "para", text: "If a pet exhibits any unusual signs, including but not limited to:" },
  { type: "bullet", text: "Vomiting." },
  { type: "bullet", text: "Diarrhea." },
  { type: "bullet", text: "Constipation." },
  { type: "bullet", text: "Reduced appetite." },
  { type: "bullet", text: "Excessive thirst." },
  { type: "bullet", text: "Excessive urination." },
  { type: "bullet", text: "Weight loss." },
  { type: "bullet", text: "Weight gain." },
  { type: "bullet", text: "Skin problems." },
  { type: "bullet", text: "Behavioral changes." },
  { type: "bullet", text: "Lethargy." },
  { type: "bullet", text: "Any other abnormal clinical signs." },
  { type: "bullet", text: "The owner must immediately discontinue feeding the diet and consult a licensed veterinarian." },
  { type: "para", text: "If concerns exist regarding the nutrient content of a prepared diet, the owner should submit representative samples to a qualified commercial laboratory for nutrient analysis before continuing long-term feeding." },
  { type: "heading", text: "NO VETERINARY OR MEDICAL RELATIONSHIP" },
  { type: "para", text: "Use of Paw-Balancer does not create:" },
  { type: "bullet", text: "A veterinarian-client-patient relationship." },
  { type: "bullet", text: "A nutritionist-client relationship." },
  { type: "bullet", text: "A professional consulting relationship." },
  { type: "bullet", text: "Any fiduciary relationship." },
  { type: "para", text: "No information provided through the platform should be interpreted as veterinary diagnosis, treatment, or individualized nutritional advice." },
  { type: "heading", text: "ASSUMPTION OF RISK" },
  { type: "para", text: "By using Paw-Balancer, users knowingly and voluntarily assume all risks associated with:" },
  { type: "bullet", text: "Diet formulation." },
  { type: "bullet", text: "Food preparation." },
  { type: "bullet", text: "Food handling." },
  { type: "bullet", text: "Food storage." },
  { type: "bullet", text: "Nutrient variability." },
  { type: "bullet", text: "Ingredient sourcing." },
  { type: "bullet", text: "Feeding homemade diets." },
  { type: "para", text: "Users understand that feeding any homemade diet carries inherent risks and that outcomes cannot be guaranteed." },
  { type: "heading", text: "DISCLAIMER OF WARRANTIES" },
  { type: "shout", text: "PAW-BALANCER IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED." },
  { type: "shout", text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAW-BALANCER DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:" },
  { type: "bullet", text: "MERCHANTABILITY." },
  { type: "bullet", text: "FITNESS FOR A PARTICULAR PURPOSE." },
  { type: "bullet", text: "ACCURACY." },
  { type: "bullet", text: "COMPLETENESS." },
  { type: "bullet", text: "RELIABILITY." },
  { type: "bullet", text: "NON-INFRINGEMENT." },
  { type: "heading", text: "LIMITATION OF LIABILITY" },
  { type: "shout", text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAW-BALANCER, ITS OWNERS, DEVELOPERS, AFFILIATES, EMPLOYEES, CONSULTANTS, CONTRACTORS, OFFICERS, DIRECTORS, AGENTS, AND REPRESENTATIVES SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES ARISING FROM OR RELATED TO:" },
  { type: "bullet", text: "USE OF THE PLATFORM." },
  { type: "bullet", text: "RELIANCE ON INFORMATION PROVIDED BY THE PLATFORM." },
  { type: "bullet", text: "RECIPE GENERATION." },
  { type: "bullet", text: "INGREDIENT SELECTION." },
  { type: "bullet", text: "FOOD PREPARATION." },
  { type: "bullet", text: "FOOD STORAGE." },
  { type: "bullet", text: "NUTRIENT VARIABILITY." },
  { type: "bullet", text: "NUTRITIONAL DEFICIENCIES." },
  { type: "bullet", text: "NUTRITIONAL EXCESSES." },
  { type: "bullet", text: "ILLNESS." },
  { type: "bullet", text: "INJURY." },
  { type: "bullet", text: "ALLERGIC REACTIONS." },
  { type: "bullet", text: "VETERINARY EXPENSES." },
  { type: "bullet", text: "PROPERTY DAMAGE." },
  { type: "bullet", text: "LOSS OF PROFITS." },
  { type: "bullet", text: "DEATH OF AN ANIMAL." },
  { type: "shout", text: "THIS LIMITATION APPLIES REGARDLESS OF THE LEGAL THEORY ASSERTED AND EVEN IF PAW-BALANCER HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES." },
  { type: "heading", text: "INDEMNIFICATION" },
  { type: "para", text: "Users agree to defend, indemnify, and hold harmless Paw-Balancer, its owners, affiliates, employees, contractors, consultants, and representatives from any claims, liabilities, damages, losses, costs, expenses, or legal fees arising from:" },
  { type: "bullet", text: "Use of the platform." },
  { type: "bullet", text: "Feeding of generated diets." },
  { type: "bullet", text: "Recipe modifications." },
  { type: "bullet", text: "Failure to follow instructions." },
  { type: "bullet", text: "Violation of these terms." },
  { type: "bullet", text: "Claims brought by third parties." },
  { type: "heading", text: "USER ACKNOWLEDGMENT" },
  { type: "para", text: "By using Paw-Balancer, the user acknowledges that:" },
  { type: "bullet", text: "They have read and understood this disclaimer." },
  { type: "bullet", text: "They understand the limitations of nutrient databases." },
  { type: "bullet", text: "They understand that actual food composition may differ from database values." },
  { type: "bullet", text: "They understand that food processing can alter nutrient content." },
  { type: "bullet", text: "They assume all risks associated with feeding generated diets." },
  { type: "bullet", text: "They accept full responsibility for ingredient selection, preparation, and feeding decisions." },
  { type: "para", text: "They release Paw-Balancer and its representatives from liability to the fullest extent permitted by law." },
  { type: "heading", text: "GOVERNING LAW" },
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
      if (key === "Fiber") return "Fiber & Seeds";
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
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <h2
      className="text-[#3C6293] mb-6"
      style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 5vw, 55px)", fontWeight: 400 }}
    >
      Step {step} Of 4
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

function ProfilePage({ onNext }: { onNext: (p: ReturnType<typeof buildProfile>) => void }) {
  const [form, setForm] = useState<ProfileData>({
    dogName: "", breed: "", age: "",
    sex: "", repro: "", activity: "",
    weightKg: "", weightLb: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(k: keyof ProfileData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  }

  function handleKgChange(v: string) {
    const kg = parseFloat(v);
    setForm(f => ({
      ...f,
      weightKg: v,
      weightLb: v && !isNaN(kg) ? (kg / 0.453592).toFixed(2) : f.weightLb,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  function handleLbChange(v: string) {
    const lb = parseFloat(v);
    setForm(f => ({
      ...f,
      weightLb: v,
      weightKg: v && !isNaN(lb) ? (lb * 0.453592).toFixed(2) : f.weightKg,
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
    onNext(buildProfile(form));
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
            <Field label="Age *" error={errors.age}>
              <input className={inputCls(!!errors.age)} value={form.age}
                onChange={e => set("age", e.target.value)} placeholder="e.g. 3 years / 8 months" />
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
                <input type="number" min="0.1" step="0.1"
                  className={inputCls(!!errors.weightKg)} value={form.weightKg}
                  onChange={e => handleKgChange(e.target.value)} placeholder="e.g. 25.0" />
              </Field>
              <Field label="Weight (lb)">
                <input type="number" min="0.1" step="0.1"
                  className={inputCls(false)} value={form.weightLb}
                  onChange={e => handleLbChange(e.target.value)} placeholder="e.g. 55.1" />
              </Field>
            </div>
            {base && form.repro && form.activity && finalDen && (
              <div className="flex items-center justify-between gap-4" style={{ marginTop: "28px", background: "#E0F2FF", borderRadius: "14px", padding: "20px 24px" }}>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#3C6293" }}>Daily Energy Need (DEN)</p>
                  <p className="text-[13px] mt-0.5" style={{ color: "#3C6293" }}>{form.repro} · {form.activity}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[40px] font-bold leading-none" style={{ color: "#143C6F" }}>{finalDen.toLocaleString()}</p>
                  <p className="text-[12px] mt-1" style={{ color: "#3C6293" }}>kcal / day</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2" style={{ marginTop: "36px" }}>
          <button onClick={submit}
            className="w-full bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
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
  repro: "Intact" | "Neutered" | "Obese" | "";
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

function buildCatProfile(form: CatProfileData) {
  const wkg = parseFloat(form.weightKg);
  const rer = 70 * Math.pow(wkg, 0.75);
  const mult = CAT_DEN_MULTIPLIER[form.repro] ?? 1.2;
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
  };
}

function CatProfilePage({ onNext }: { onNext: (p: ReturnType<typeof buildCatProfile>) => void }) {
  const [form, setForm] = useState<CatProfileData>({
    catName: "", breed: "", age: "",
    sex: "", repro: "",
    weightKg: "", weightLb: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(k: keyof CatProfileData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  }

  function handleKgChange(v: string) {
    const kg = parseFloat(v);
    setForm(f => ({
      ...f,
      weightKg: v,
      weightLb: v && !isNaN(kg) ? (kg / 0.453592).toFixed(2) : f.weightLb,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  function handleLbChange(v: string) {
    const lb = parseFloat(v);
    setForm(f => ({
      ...f,
      weightLb: v,
      weightKg: v && !isNaN(lb) ? (lb * 0.453592).toFixed(2) : f.weightKg,
    }));
    setErrors(e => ({ ...e, weightKg: "", weightLb: "" }));
  }

  const weightKgNum = parseFloat(form.weightKg) || null;
  const rer = weightKgNum && weightKgNum > 0 ? 70 * Math.pow(weightKgNum, 0.75) : null;

  const denIntact   = rer ? Math.round(rer * 1.4) : null;
  const denNeutered = rer ? Math.round(rer * 1.2) : null;
  const denObese    = rer ? Math.round(rer * 1.0) : null;

  const activeDen = form.repro === "Intact" ? denIntact
    : form.repro === "Neutered" ? denNeutered
    : form.repro === "Obese" ? denObese
    : null;

  function validate() {
    const e: Record<string, string> = {};
    if (!form.catName.trim()) e.catName = "Please enter your cat's name.";
    if (!form.age.trim()) e.age = "Please enter your cat's age.";
    if (!form.sex) e.sex = "Please select a sex.";
    if (!form.repro) e.repro = "Please select reproductive status.";
    if (!form.weightKg || parseFloat(form.weightKg) <= 0) e.weightKg = "Please enter a valid body weight.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onNext(buildCatProfile(form));
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
            <Field label="Age *" error={errors.age}>
              <input className={inputCls(!!errors.age)} value={form.age}
                onChange={e => set("age", e.target.value)} placeholder="e.g. 3 years / 8 months" />
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
              name="cat-repro" value={form.repro}
              options={[
                { value: "Intact", label: "Intact" },
                { value: "Neutered", label: "Neutered" },
                { value: "Obese", label: "Obese" },
              ]}
              onChange={v => set("repro", v)}
            />
          </Field>

          <div className="mt-6" style={{ marginTop: "24px" }}>
            <SectionLabel>Body Weight</SectionLabel>
            <div className="grid grid-cols-2" style={{ gap: "16px" }}>
              <Field label="Weight (kg) *" error={errors.weightKg}>
                <input type="number" min="0.1" step="0.1"
                  className={inputCls(!!errors.weightKg)} value={form.weightKg}
                  onChange={e => handleKgChange(e.target.value)} placeholder="e.g. 4.5" />
              </Field>
              <Field label="Weight (lb)">
                <input type="number" min="0.1" step="0.1"
                  className={inputCls(false)} value={form.weightLb}
                  onChange={e => handleLbChange(e.target.value)} placeholder="e.g. 9.9" />
              </Field>
            </div>

            {rer && form.repro && activeDen && (
              <div className="flex items-center justify-between gap-4" style={{ marginTop: "28px", background: "#E0F2FF", borderRadius: "14px", padding: "20px 24px" }}>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#3C6293" }}>Daily Energy Need (DEN)</p>
                  <p className="text-[13px] mt-0.5" style={{ color: "#3C6293" }}>{form.repro} adult</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[40px] font-bold leading-none" style={{ color: "#143C6F" }}>{activeDen.toLocaleString()}</p>
                  <p className="text-[12px] mt-1" style={{ color: "#3C6293" }}>kcal / day</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2" style={{ marginTop: "36px" }}>
          <button onClick={submit}
            className="w-full bg-[#143C6F] hover:bg-[#FF9D36] text-white transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
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
}: {
  onBack: () => void;
  onCalculate: (selected: string[]) => void;
  onIngredientsLoaded: (items: IngredientItem[]) => void;
  apiBase: string;
  initialSelected?: string[];
  onSelectionChange?: (selected: string[]) => void;
  serverError?: string;
}) {
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [valError, setValError] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/user-ingredients`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((flat: IngredientItem[]) => {
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
      })
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
    const missing = Object.values(categories)
      .filter(c => c.mandatory && c.selected.length === 0)
      .map(c => c.clean);
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
        setValError("Please select at least 2 vegetables total from Vegetable A and/or Vegetable B.");
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
                    style={{ fontFamily: "'Marcellus', serif", fontSize: "30px", fontWeight: 700, marginBottom: superGroup === "Vegetable" ? "6px" : "20px" }}
                  >
                    {superGroup}
                  </h3>
                  {superGroup === "Vegetable" && (
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
                                {cat.mandatory ? `Min: ${cat.min}, Max: ${maxLabel}` : `Max: ${maxLabel}`}
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
                                justifyContent: "center",
                                gap: "12px",
                                width: "100%",
                              }}
                            >
                              {cat.items.map(name => {
                                const isSel = selected.has(name);
                                const displayName = INGREDIENT_DISPLAY_OVERRIDES[name] ?? name;
                                return (
                                  <button key={name} type="button" onClick={() => toggle(name, gn)}
                                    className="text-[15px] font-extrabold transition-all rounded-full"
                                    style={{
                                      flex: "0 0 calc(33.333% - 8px)",
                                      padding: "14px 18px",
                                      background: isSel ? color : chipBg,
                                      color: isSel ? "#fff" : "#211915",
                                      textAlign: "center",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    {displayName}
                                  </button>
                                );
                              })}
                            </div>
                            {cat.items.length === 2 && (
                              <button
                                type="button"
                                onClick={() => toggleAll(gn)}
                                className="text-[15px] font-extrabold transition-all rounded-full"
                                style={{
                                  width: "calc(33.333% - 8px)",
                                  padding: "14px 18px",
                                  background: "transparent",
                                  border: `1.5px solid ${color}`,
                                  color: color,
                                  boxSizing: "border-box",
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
                ← Back
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
  onReset,
  petType,
  dietType,
  initialFeedPlanUnlocked,
}: {
  profile: ReturnType<typeof buildProfile>;
  result: CalcResult | null;
  selectedIngredients: string[];
  allIngredients: IngredientItem[];
  onBack: () => void;
  onReset: () => void;
  petType: PetType;
  dietType: DietType;
  initialFeedPlanUnlocked?: boolean;
}) {
  const [feedPlanUnlocked, setFeedPlanUnlocked] = useState(!!initialFeedPlanUnlocked);

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

  const r = result as unknown as Record<string, number | null>;

  // Calorie % from energy (pie chart formula)
  const energy = result.Energy ?? 0;
  const proteinCalPct = energy > 0 ? ((4 * (result.Protein_percent ?? 0)) / energy) * 1000 : null;
  const fatCalPct     = energy > 0 ? ((9 * (result.Fat_percent     ?? 0)) / energy) * 1000 : null;
  const choCalPct     = energy > 0 ? ((4 * (result.CHO_percent     ?? 0)) / energy) * 1000 : null;

  // Per 1000 Kcal DM calculator — all nutrients use (val / Energy) * 1000
  // (matches the clone's calculation exactly). perKcal: null = no calc (e.g. Ca:P ratio).
  function calcPerKcal(val: number | null, formula: "x1000" | null): number | null {
    if (formula === null || val == null || energy <= 0) return null;
    return (val / energy) * 1000;
  }

  // Unified table sections
  // perKcal: "x1000" for all nutrient rows, null for no calc (Ca:P ratio stays blank per-1000-kcal)
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
      { label: "Ca:P ratio",      unit: "ratio",    val: result.Ca_P_ratio,       min: null, dec: 2, perKcal: null as null },
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
        <style>{`
          .print-only { display: none; }
          @media print {
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
              background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTkwIiB2aWV3Qm94PSIwIDAgMzAwIDE5MCI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTUwLDk1KSByb3RhdGUoLTMwKSBzY2FsZSgwLjQyKSB0cmFuc2xhdGUoLTIyOSwtMzYpIj48cGF0aCBkPSJNMTc0LjYwNiA2My4zNjI2QzE3Mi4zOCA2Mi44MzIxIDE3MC40NzcgNjEuNjg0NCAxNjkuMjU4IDU5Ljc0OUMxNjcuODc5IDU3LjU2MjggMTY3Ljc5MyA1NC43NzU1IDE2OC4yNDMgNTIuMTJDMTY5LjIwOCA0Ni40MTk5IDE2OS41NDQgNDAuOTg2NyAxNjkuMzg1IDM1LjE0NTFMMTY4LjgwNSAxMy45NzE2QzE2OC42NDMgOC4wNzU0NCAxNzAuMzkxIDMuNDEwNTggMTc1LjQxNCAxLjkxODg1QzE4NC40MjcgLTAuNzU1OTY2IDE5OC44MSAtMS42NDY1IDIwNS42NzMgNi4wOTUwNUMyMDguNjYgOS40NjQyOSAyMDkuNjU3IDE0LjIwOTUgMjA4Ljg3NiAxOS4xMTg3QzIwOC4yMzIgMjMuMTgyNCAyMDUuODk4IDI3LjEwNzggMjAyLjM3MiAyOS4yNTIyQzIwOS4wNDMgMzEuNzY2MiAyMTMuMTM4IDM4LjQ1NjUgMjEyLjk5NiA0Ni40MTAyQzIxMi44NjkgNTMuNTgyOCAyMDkuMzcxIDU5LjcwNCAyMDMuNjQ3IDYyLjU2NTNDMjAxLjAxOSA2My44ODAyIDE5OC4yMDIgNjQuNTY4MiAxOTUuMjU3IDY0Ljc3NzFDMTg4LjMzOSA2NS4yNzIyIDE4MS41MTggNjUuMDAyMiAxNzQuNjA2IDYzLjM1OTNWNjMuMzYyNlpNMTg2LjUzNiAyNC44MTg4QzE4OS43NjcgMjUuMzA3NSAxOTIuODczIDIzLjcxMjkgMTk0LjA2NSAyMC4zNjkzQzE5NC44NjggMTguMTE1NyAxOTQuNjAxIDE1LjY5NDggMTkzLjM5OCAxMy43OTQ4QzE5Mi4zMzEgMTIuMTEzNCAxOTAuNjA5IDExLjMzMjIgMTg4LjU3MiAxMS4yNTVDMTg2LjM3NSAxMS4xNzQ2IDE4NC40MTMgMTIuMzI4OCAxODMuODQ5IDE0LjkzOTNDMTgzLjAxIDE4LjgwNjkgMTgzLjIzIDI0LjMxNCAxODYuNTM2IDI0LjgxNTZWMjQuODE4OFpNMTg5LjgyIDUyLjgxNDRDMTkzLjg1NyA1Mi44Nzg3IDE5Ni43MTYgNDkuNTM4NCAxOTYuOTEzIDQ1LjExMTRDMTk3LjA0MSA0Mi4yNjYyIDE5Ni4xODIgMzkuNjMgMTk0LjM5NiAzNy44ODc1QzE5Mi42NzMgMzYuMjA5MyAxOTAuMzYyIDM1LjU4MjQgMTg4LjAzNiAzNi4xMTkzQzE4My42OTEgMzcuMTI1NSAxODIuOTEgNDIuNDMwMiAxODMuODM4IDQ3LjM0OUMxODQuNDU4IDUwLjYzMTQgMTg2Ljc4MyA1Mi43NjI5IDE4OS44MiA1Mi44MTEyVjUyLjgxNDRaIiBmaWxsPSIjMTQzQzZGIi8+CjxwYXRoIGQ9Ik0xMDguOTE4IDMzLjU3MjlDMTA4LjMzNCAzNi42OTE3IDEwOC4xNjcgMzkuNzk3NSAxMDkuMTY4IDQyLjU5NzZDMTA5LjY2OSA0NC4wMDI1IDExMC44NCA0NC40NDE1IDExMi4wOTggNDQuMjA0MUMxMTIuOTA0IDQ0LjA1MTMgMTEzLjk3IDQyLjk5NzYgMTE0LjI5OSA0MS42OTAyQzExNS43NTIgMzUuOTIwOSAxMTQuMTgxIDMwLjE3NDQgMTE1LjIwNyAyNC42NzVDMTE1Ljc3MSAyMS42NDczIDExNy40MzMgMTkuMjc2NSAxMTkuNjIzIDE4LjU1MTNDMTIyLjIxOSAxNy42OTI3IDEyNC45ODUgMTguNDA4MiAxMjYuNTc3IDIwLjk5MzZDMTI3LjcwMSAyMi44MTgxIDEyOC4yNDcgMjUuMjczNCAxMjguMTg5IDI3LjU5NTVMMTI3Ljk1MyAzNy4zNjE2QzEyNy45MDQgMzkuNDQ2MyAxMjguMjQ0IDQxLjc1NTMgMTI5LjM0MyA0My4zNTg2QzEzMC4xMDIgNDQuNDY3NiAxMzEuNTMxIDQ0LjQ3NzMgMTMyLjcyNiA0My45OTkzQzEzNS4yMjMgNDMuMDAwOCAxMzUuNjY3IDM3LjUyNDIgMTM0Ljc3MyAzMy42NTA5TDEzMy4xOTcgMjYuODIxNEMxMzIuNDg3IDIzLjc0MTcgMTMyLjg5NiAyMC4yNDI0IDEzNC41ODQgMTcuNzAyNEMxMzYuNzExIDE0LjUwNTYgMTQwLjc1NyAxNC4xMzE2IDE0My4zNzggMTYuNjUyQzE0NC45NTcgMTguMTc0IDE0Ni4wNzMgMjAuMTMxOCAxNDYuNzcyIDIyLjQyMTNDMTQ5Ljc0NiAzMi4xNzQ1IDE1MC4wODMgNDQuNjA0MiAxNDUuNjgzIDUzLjU4MzNDMTQxLjg1MSA2MS40MDggMTM0LjEyOSA2NS4wNDcxIDEyNi45NDIgNjEuNzkxN0MxMjQuNjc4IDYwLjc2NzMgMTIyLjk2MiA1OC44MzU1IDEyMS4yNjIgNTYuNjExQzExNS40OTQgNjQuOTY1OCAxMDUuMDUzIDY1LjE0MTQgOTkuMTM3NyA1Ny4wNTAxQzk2LjM5MSA1My4yOTA2IDk0Ljg0NDkgNDguNzIxNCA5NC4yODg1IDQzLjcwMDFDOTMuNDE5NSAzNS44ODg0IDk0LjM4NzEgMjMuODQyNSA5OC45MzQ4IDE4LjMwNDFDMTAxLjE5NiAxNS41NDk1IDEwNS4wMDcgMTQuOTI1MSAxMDcuNzgxIDE2Ljk4MDVDMTA5Ljk5MyAxOC42MTk2IDExMS4wODQgMjEuOTkyIDExMC41MjUgMjQuOTgwN0wxMDguOTE2IDMzLjU3MjlIMTA4LjkxOFoiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTgwLjg3MjUgNTkuMzg1NUM3My4zODE3IDY0LjQ5MjQgNjAuMjA0IDY0LjgxNDggNTUuNTYzNiA1Ni4yNTU2QzUyLjM3NzIgNTAuMzgwMSA1NC4yODAyIDQyLjgyNzMgNTkuMjg0MiAzOS4xNjMzQzY0LjU4IDM1LjI4NDMgNzEuMDYwMSAzNC43MjA4IDc3LjIxNTIgMzYuNjM5MkM3Ny4yNDI3IDM0LjI3NDYgNzUuOTIwOCAzMi40ODY2IDc0LjA5MjIgMzEuNjkxOUM2OS4yMzE1IDI5LjU4MTQgNjUuNTQxMiAzMy4yMzI0IDYxLjc0MDcgMzMuNzA0N0M1OS41NzA2IDMzLjk3MTcgNTcuMjc2NSAzMy4wMDc3IDU2LjI3NjggMzAuNjk1M0M1NS4xMzk1IDI4LjA2NjkgNTUuODcyIDI0Ljk1NjYgNTcuNDM5IDIyLjcxOTFDNjIuMTQgMTUuOTk2OCA3MS42OTA4IDE0Ljc1OTEgNzguODEyNSAxNy4wNjgzQzgzLjE1MjcgMTguNDc1MyA4Ni44Nzg4IDIxLjc0NTIgODkuMDc2NSAyNi4zNjAzQzkyLjM1MzcgMzMuMjM4OSA5MS40NjE0IDQxLjU3MDIgOTAuMTA2NSA0OS4xMTk3QzkxLjY5IDUwLjc5MzggOTIuNzMzOCA1Mi44NDU2IDkyLjk3ODkgNTUuMjQ2QzkzLjIyNjcgNTguODQxNiA5MS4yNzE0IDYxLjc4OTIgODguMzE2NCA2Mi40NTM2Qzg1LjQ5OTEgNjMuMDg4NyA4Mi43MjMxIDYyLjEzMTEgODAuODc1MiA1OS4zODU1SDgwLjg3MjVaTTc1LjYxNzkgNTAuOTExQzc2LjQ2ODkgNTAuMDY0MiA3Ni43ODI4IDQ4Ljc2MTUgNzYuNTQ2IDQ3LjU3NTlDNzYuMDIgNDQuOTE1IDcxLjUzMzggNDMuODY2MyA2OC42Nzc5IDQ2LjQ2NTNDNjcuOTU5MSA0Ny4xMiA2Ny41NDA1IDQ4LjM0NzggNjcuNjM0MiA0OS40MjU5QzY3LjcwNTggNTAuMjc5MiA2OC4zNzc3IDUxLjM3MDIgNjkuMjAxMiA1MS44MTY0QzcxLjMwNTIgNTIuOTUzMSA3My43NjQ1IDUyLjc1NzcgNzUuNjE3OSA1MC45MTQzVjUwLjkxMVoiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTMzMi45MTMgMzMuNTUxM0MzMjkuNzQ0IDM4LjM0MzIgMzMwLjk3MSA0OC4zNTA4IDMzMi42NiA1NC41ODkyQzMzMy43MTEgNTguNDczOCAzMzIuNjA3IDYxLjkyNTEgMzI5LjE1MSA2Mi45MTk2QzMyNi4wMjIgNjMuODIwNiAzMjIuODM5IDYzLjgzMzEgMzE5Ljc3MyA2Mi44MDQyQzMxNy41MjggNjIuMDUyOSAzMTYuMDkzIDU5LjgzNjIgMzE2LjI3NCA1Ny4xMzY0TDMxNy4wNSA1Mi40Nzg2QzMxOC44MzkgNDUuMjM2MyAzMTkuMDUzIDM1Ljg4MzMgMzE1LjY3OCAyOS40MTQyQzMxNC40MzUgMjcuMDM1NCAzMTQuOTMzIDI0LjE3MzQgMzE2LjkxMSAyMi40MDU3QzMxOS40MDYgMjAuMTczNSAzMjIuNzg2IDE4Ljk5MTkgMzI1LjkzNiAxOS4zOTcyQzMyOC44ODIgMTkuNzc0NCAzMzAuNDQyIDIyLjEyMiAzMzAuNDEyIDI1LjYyOTRDMzMzLjYxOSAyMC4xMDE4IDMzOS4xOTcgMTcuNzA3NCAzNDQuNjU1IDE5LjY4NzFDMzUwLjAxMyAyMS42MjYzIDM1Mi40MTIgMjcuOTg5NCAzNTIuMjg5IDM0LjEwOTRMMzUyLjA4IDQ0LjM5MTRDMzUyLjAwMyA0OC4xNjY5IDM1My4xNzEgNTEuNjk2MSAzNTUuMDg1IDU0LjY5ODNDMzU2Ljc4NSA1Ny4zNjM5IDM1Ni4wNTkgNjAuODM3IDM1My4zODUgNjIuNDU4MkMzNTAuNDczIDY0LjIyMjggMzQ2Ljc3IDY0LjQ2OTEgMzQzLjU3IDYzLjIxNThDMzQxLjQ0MiA2Mi4zODM0IDM0MC4wMzcgNjAuMjI5MSAzMzkuNDg5IDU3LjgzMTZDMzM4Ljg4IDU1LjE3MjIgMzM5LjAxOSA1Mi40NjYxIDMzOS4yMzkgNDkuNjg1MkwzNDAuMTI0IDM4LjQ3NDFDMzQwLjI3NyAzNi41Mjg3IDMzOS44OTggMzQuMzA4OSAzMzguNzA1IDMyLjg3NDhDMzM3LjExOSAzMC45NjY4IDMzNC4yNyAzMS41MDMgMzMyLjkxNSAzMy41NTQ0TDMzMi45MTMgMzMuNTUxM1oiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTIyMS4xMzIgNjIuNTg3OEMyMTYuMDc0IDYwLjIzOTEgMjEzLjc5NiA1NC4yMzYzIDIxNS42MjggNDguNDM4NUMyMTguNDgyIDM5LjM5MzQgMjI5LjcyOCAzNi45OTc0IDIzNy44NDUgMzguNDc5MUMyMzguODYgMzUuNDYyIDIzNy4zODcgMzIuNDI5MSAyMzQuNzg0IDMxLjcwNEMyMzAuNzk2IDMwLjU5NDIgMjI5LjAwOSAzNC4wMTgxIDIyNS42MzYgMzUuNjQ4QzIyMy4yMTQgMzYuODE3NiAyMjAuNjA2IDM2LjA2NDIgMjE5LjAxNyAzMy44NjY3QzIxNy40NDggMzEuNjk0NSAyMTcuMzE1IDI4LjQ5NDUgMjE4LjgyOSAyNS45NjkyQzIyMC4wNDMgMjMuOTQyIDIyMS44NDcgMjIuNDIyNCAyMjMuOTEyIDIxLjQwNzJDMjI5LjYxNSAxOC42MDEzIDIzNi4wNjkgMTguMjUxNCAyNDEuOTc5IDIwLjM0MTZDMjQ3LjM1NCAyMi4yNDI3IDI1MC45NzUgMjcuMDYzMiAyNTEuODU1IDMzLjM0OTdDMjUzLjAxNiA0MS42NDEzIDI1MC42MTQgNDcuNjQ0IDI1MS41NDMgNTAuNzcxNUwyNTMuMzQ3IDU0LjI2NzlDMjU0LjI3OSA1Ni4wNzQ0IDI1NC4xODUgNTguMzM4IDI1My4yNDcgNjAuMzM2OEMyNTIuNTM5IDYxLjg0MzggMjUwLjk2NyA2My4xMjM4IDI0OS4xNDYgNjMuNTAyMUMyNDUuODEyIDY0LjE5NTcgMjQyLjU3NyA2Mi45MTI2IDI0MC41MiA1OS42NDY0QzIzNC42ODcgNjMuNDUxNyAyMjcuNTQ3IDY1LjU3MzUgMjIxLjE0MSA2Mi41OTQxTDIyMS4xMzIgNjIuNTg3OFpNMjM2Ljg5MSA1MS44MTE5QzIzOC4xOTUgNTAuMzMzMyAyMzguODEzIDQ3LjY0MDkgMjM3Ljc2OCA0NS45MTYzQzIzMy45MjkgNDQuNDU2NiAyMjcuOTggNDcuMzQ0NSAyMjguODI3IDUxLjU4NDlDMjI5LjM1OSA1NC4yNTg0IDIzNC4wODYgNTQuOTg5OCAyMzYuODkzIDUxLjgwODhMMjM2Ljg5MSA1MS44MTE5WiIgZmlsbD0iIzE0M0M2RiIvPgo8cGF0aCBkPSJNMjc1Ljk3MyA1Ny4xODU1QzI3My44NDUgNTIuMTEzNiAyNzUuMzYzIDQ2LjM1NjkgMjc5LjAxMyA0Mi45NjcyQzI4My44NDkgMzguNDc2MSAyOTEuNjY5IDM3LjQzMTUgMjk3Ljk0IDM4LjUxNzJDMjk4Ljc1IDM2LjAzOTYgMjk3LjkxIDMzLjI0MDIgMjk1LjkxNSAzMi4xMzI0QzI5My42MTUgMzAuODU3MyAyOTEuMDY1IDMxLjYwNTMgMjg5LjA4NiAzMy4zMDMzQzI4Ny42NTkgMzQuNTMxIDI4Ni4xMSAzNS42NzY3IDI4NC4zNyAzNi4wODM4QzI4MS45OTggMzYuNjM5MyAyNzkuODQ0IDM1LjQwNTIgMjc4LjY4MyAzMy4yODc1QzI3Ny40ODMgMzEuMDk0IDI3Ny40NTggMjguMzE2NyAyNzguODUyIDI2LjAwMzJDMjgwLjM2OCAyMy40ODc4IDI4Mi42OTEgMjEuODIxNCAyODUuMzA0IDIwLjc1NzhDMjkwLjk2NSAxOC40NDc1IDI5Ny4yMiAxOC40MDM0IDMwMi44ODIgMjAuNjkxNUMzMDcuODIgMjIuNjg2MiAzMTEuMDI5IDI3LjM0MTQgMzExLjg4NSAzMy4xNjQ0QzMxMi41NzIgMzcuODM1NCAzMTIuMTk4IDQyLjQ1MjggMzExLjQ3NSA0Ny4xNDU5QzMxMS4xMTggNDkuNDU2MiAzMTEuNDI4IDUxLjQ1NCAzMTIuOTAyIDUzLjA4NTdDMzE0Ljc0IDU2LjM1NTQgMzE0LjMyMSA2MC42NzYxIDMxMS4yNjQgNjIuNjI2NkMzMDcuNTQgNjUuMDA2MyAzMDMuMDU2IDYzLjUwNzEgMzAwLjU0NSA1OS42MTg4QzI5NS4yNTUgNjMuMjA0MSAyODkuNDQ5IDY0LjkzMDUgMjgzLjU3NyA2My40OTQ1QzI4MC4zNTQgNjIuNzA1NSAyNzcuNDUzIDYwLjcwNzcgMjc1Ljk3NiA1Ny4xODU1SDI3NS45NzNaTTI5Ni40NTIgNTIuMzM3N0MyOTguMDQzIDUxLjAwOSAyOTkuMDE4IDQ3Ljk2OTcgMjk3LjgzNSA0NS45NjI0QzI5NC4wMzMgNDQuNDE1OSAyODguMDYxIDQ3LjQ0MjYgMjg4LjkyMyA1MS41NTVDMjg5LjQ4IDU0LjIwNjEgMjkzLjQwNyA1NC44ODQ3IDI5Ni40NTUgNTIuMzM3N0gyOTYuNDUyWiIgZmlsbD0iIzE0M0M2RiIvPgo8cGF0aCBkPSJNNDA3LjQwNyA0OS4xMzM5QzQxMS4zODMgNTMuMjA5MyA0MTUuNzIgNTEuNzg2NSA0MTkuNjA5IDQ3Ljk3NjdDNDIwLjU1MiA0Ny4wNTM1IDQyMS45MTMgNDYuNjE0IDQyMy4wNjggNDcuMjQ5NUM0MjYuNjYzIDQ5LjIyNTYgNDI0Ljc3NyA1Ny42MDA5IDQyMS4xOTggNjAuMjI4MkM0MTYuMDgxIDYzLjk4NDMgNDA5LjY1NCA2NC44MjUzIDQwMy44MTUgNjMuMjM4MUMzOTcuMzc0IDYxLjQ4NjYgMzkyLjYxOSA1NS45NzI2IDM5MC44MjIgNDguNjU2NUMzODguODQ5IDQwLjYyNTggMzkwLjQ5MSAzMi4xNjUxIDM5NS4wNTYgMjUuNzM3NEMzOTkuMjkzIDE5Ljc3NDUgNDA1Ljc2OCAxNy4xMTU1IDQxMi4zMzQgMTguMjZDNDE2LjA3IDE4LjkxMTMgNDE5LjYxMSAyMC42NTAzIDQyMS45NTQgMjQuMTU2NkM0MjQuMjEyIDI3LjUzNjQgNDI0LjYyIDMxLjgyNjggNDIzLjMyMyAzNi4xMTA5QzQyMi4zMjEgMzkuNDIxMiA0MTkuODk3IDQyLjQ0MzcgNDE2LjYgNDMuODUwN0w0MTAuNDY3IDQ2LjQ2ODZDNDA5LjI0NCA0Ni45OTAyIDQwOC4xMzggNDcuOTk1NyA0MDcuNDEgNDkuMTMwN0w0MDcuNDA3IDQ5LjEzMzlaTTQwOS44MDkgMzcuMDU2MkM0MTEuMTA4IDM2LjEyMzUgNDExLjk2NyAzNC40NzMxIDQxMi4xNTUgMzMuMTM4OUM0MTIuMzk0IDMxLjQzMTYgNDEyLjA3OCAyOS42MDQxIDQxMC44NjEgMjguNTAwN0M0MDguNTI0IDI2LjM4MjQgNDA1LjI3NyAyNy41NDkxIDQwMy43MDMgMzAuNTAyMUM0MDEuOTIzIDMzLjg0MDggNDAyLjA0NiAzOC4xODUgNDAzLjE5OCA0MS44MDUxTDQwOS44MDkgMzcuMDU2MloiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTM3Ny4wMTIgNTAuMzI3N0MzODEuODQ5IDUwLjcxNDIgMzg0LjIwOSA0Ny4zMTQ4IDM4Ni4yODQgNDguMjIwOUMzODguMDQ2IDQ4Ljk5MDcgMzg4LjM5NCA1Mi4yNTA4IDM4Ny41ODggNTQuOTA4OEMzODYuMzY2IDU4Ljk0NTEgMzgzLjUzNSA2Mi4wMTUgMzc5LjkyNSA2My4xMTc2QzM2OS4zMyA2Ni4zNjE4IDM1OC44MDkgNjAuNDk3NSAzNTUuNzk5IDQ4LjIxNDVDMzUzLjgxMiA0MC4xMDQgMzU1LjYwMiAzMS40MDQzIDM2MC4zNjUgMjUuMDY3OUMzNjQuMjEzIDE5Ljk0NSAzNjkuNzE2IDE3LjQ5OTIgMzc1LjU1MSAxOC4wODUzQzM4MS4zODYgMTguNjcxNCAzODguNTcgMjIuNjk4MSAzODcuNjYgMjkuNzUzNkMzODcuMzU4IDMyLjEwNDQgMzg2LjA4MSAzNC41MDI3IDM4NC4wMTIgMzUuNTQxOUMzODEuMTA5IDM3LjAwMjQgMzc4LjI2NSAzNS41MTY1IDM3Ni45OTggMzIuMjc1NUMzNzYuNDMxIDMwLjgyMTMgMzc1LjI2MSAyOS40OTA3IDM3NC4yMjUgMjkuMjM0MUMzNzIuNjAyIDI4LjgzMTcgMzcxLjA5OCAyOS41MDk3IDM3MC4wNzYgMzAuOTMyMkMzNjcuODQ1IDM0LjAzMDcgMzY3LjUyNCAzOC4yOTE4IDM2OC40MTcgNDIuMTU3QzM2OS41MDggNDYuODc3NiAzNzIuNzgzIDQ5Ljk5MTkgMzc3LjAxMiA1MC4zMzA5VjUwLjMyNzdaIiBmaWxsPSIjMTQzQzZGIi8+CjxwYXRoIGQ9Ik0yNjkuMzAzIDYzLjA2NDhDMjY2LjExNSA2NC4yNjg3IDI2Mi45MTggNjQuMjE3MiAyNTkuNzY4IDYzLjQzODJDMjU2LjgxOSA2Mi43MDc2IDI1NC45NDggNTkuNTQwMyAyNTUuNDIyIDU1Ljk2NzVMMjU2LjczOSA0Ni4wMTgzQzI1Ny42OTggMzYuMjA0MyAyNTcuMDU5IDI2LjU1NDUgMjU1LjY4NiAxNi44NDAyQzI1NC43NTggMTAuMjcwOCAyNTMuODIxIDMuNjA3OTMgMjU5Ljc0MyAwLjk0NjAxMUMyNjIuMTAyIC0wLjExMjk2IDI2NC43NDggLTAuMjczODk4IDI2Ny4yMzYgMC40MTgxMzVDMjczLjAyMSAyLjAyNzUxIDI3Mi40MDYgOS45MTM0OCAyNzEuNjQ2IDE2LjQ5OTFDMjcwLjE5MSAyOS4xMjYyIDI2OC41MzIgNDMuNDk0OCAyNzIuNjE2IDU1LjE2OTJDMjczLjc2NSA1OC40NDkyIDI3Mi4yNDEgNjEuOTU3NiAyNjkuMzAzIDYzLjA2ODFWNjMuMDY0OFoiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTQ0Ni40MDUgMzMuMzcyMkM0NDEuOSAzNC43ODM4IDQ0MS4yNjMgNDcuNzQ4MSA0NDUuODYgNTYuMjUyMUM0NDYuNDc2IDU3LjM5MDIgNDQ2LjU1OCA1OS4xMDY5IDQ0Ni4xMzQgNjAuNDA3MkM0NDQuODQ3IDY0LjM3NzggNDM2LjQ2NSA2NC42MzIxIDQzMS42OTggNjMuMjExMUM0MjkuMjE4IDYyLjQ3MzYgNDI3LjYgNTkuODc5NCA0MjguMjI5IDU2Ljk3MDZMNDI5LjU4NyA1MC42ODg3QzQzMS4wMjIgNDQuMDU0IDQzMC44MjUgMzUuMjI4OCA0MjcuNzM2IDI5LjM1MDdDNDI2LjQ2MSAyNi45MjUxIDQyNi44NTUgMjMuOTQ5NCA0MjguODIzIDIyLjEwMjRDNDMxLjMzNCAxOS43NDY3IDQzNC42NzUgMTguNTc2OCA0MzcuOTAzIDE5LjEzOTVDNDQwLjQxOSAxOS41NzgyIDQ0MS43MzYgMjEuODg2MiA0NDEuODAyIDI0Ljk5ODVDNDQ1Ljc4MyAxOC45Njc4IDQ1NC42MTMgMTYuNTA0IDQ1Ni45ODQgMjIuNDE3MUM0NTguMzU2IDI1LjgzNzggNDU4LjMxOCAyOS43NzM1IDQ1Ni45OTMgMzMuMTc4M0M0NTYuMTA2IDM1LjQ1NDUgNDU0LjE0MiAzNi43MDM5IDQ1Mi4wMiAzNS43MjE2TDQ0OS42MDUgMzQuMTE2MUM0NDguNjY0IDMzLjQ4OTkgNDQ3LjU4NyAzMy4wMDAzIDQ0Ni40MSAzMy4zNjkxTDQ0Ni40MDUgMzMuMzcyMloiIGZpbGw9IiMxNDNDNkYiLz4KPHBhdGggZD0iTTQ5LjAwODcgMTMuOTcxOEM0Mi45MTAyIDAuMTk1Mjc0IDI3LjU0NzggLTEuNzAyNzIgMTcuMzMwMSA3LjU1ODA1QzE2LjYyNTIgNS4xNDY4MyAxNS42MjQ0IDMuMDE5NjYgMTMuNzc1IDEuODg2NjhDMTAuNTI2NyAtMC4xMDQ5MTggNi44MjIyIDEuMzk5MjcgNC44Nzg3NSA0Ljk5MTg5QzAuMjQyNjUyIDEzLjU0NTggMC4wMzI1NDg5IDI2LjcwOSAwLjAwMjEzOTIyIDM3LjEzNTFDLTAuMDE3MjEyNCA0NC4wNzUgMC4wODIzMTAyIDUwLjczNzMgMC44MTc2NzIgNTcuNTczOUMxLjU4MzQ0IDY0LjY4ODIgNC4xMTAyMSA3Mi41NzM5IDEwLjYyODkgNzEuOTY3QzE4LjE2MjIgNzEuNDk1OCAxNy43MDYxIDYwLjk4MjYgMTguMDY4MyA1Mi43NzA5QzIzLjU2NjkgNTYuMDUwNCAyOC45NjYgNTcuMTkzMSAzNC42Nzc1IDU2LjE4MjdDNDIuMDE3MyA1NC41OTc5IDQ3Ljc0NTMgNDguNTk3MiA1MC4yMjIzIDQwLjQwMTdDNTIuODU5NyAzMS42NzY3IDUyLjY0OTYgMjIuMjA2MSA0OS4wMDYgMTMuOTY4Nkw0OS4wMDg3IDEzLjk3MThaTTMyLjI0NzUgMTEuNjk5NEMzMy4yNTM3IDExLjE0NzQgMzQuMzc4OSAxMS4zMTUzIDM1LjE5NzIgMTIuMjA5NEMzNS43OTE2IDEyLjg2MTQgMzYuMTkyNCAxMy42OTc1IDM2LjQxNjQgMTQuNjQ5N0MzNy4wMTM1IDE3LjE2NzQgMzYuNTYyOSAxOS45NDAyIDM1LjE4ODkgMjEuOTg5OUMzNC43MjE3IDIyLjY4NzEgMzQuMTY4OCAyMy4yMTY1IDMzLjQ2MTEgMjMuNTQ4OUMzMi4zMjQ5IDI0LjA4MTUgMzEuMTg4NiAyMy42NzgxIDMwLjQxNzMgMjIuNjIyNUMyOC4xMjgzIDE5LjQ3ODYgMjkuMjgzOSAxMy4zMjMgMzIuMjUwMiAxMS42OTYyTDMyLjI0NzUgMTEuNjk5NFpNMjAuNTM3IDEyLjcxOTRDMjEuMzkxMiAxMS4zNzY2IDIyLjg0MjYgMTAuOTg2MSAyNC4wOTQ5IDExLjgxNTZDMjQuNjQyMyAxMi4xNzcxIDI1LjA5NTcgMTIuNjE5NCAyNS40ODgyIDEzLjIzMjdDMjYuNzk1OCAxNS4yODI0IDI3LjI0OTIgMTcuOTYxNSAyNi42NzcgMjAuNDQzN0MyNi40NTU4IDIxLjQwMjQgMjYuMDY4OCAyMi4yMzIgMjUuNDQ5NSAyMi45MjI3QzI0LjY1ODkgMjMuODA3MiAyMy41ODkgMjQuMDIwMiAyMi42MTMxIDIzLjUyMzFDMTkuNjI3NCAyMi4wMDI4IDE4LjM4NjIgMTYuMDk5IDIwLjUzNyAxMi43MTYyVjEyLjcxOTRaTTEzLjIyMjEgMjEuNDU3M0MxMy44NDk2IDIwLjE2NjEgMTUuMTE1OCAxOS42NCAxNi4zMjExIDIwLjEyNzRDMTkuMjE1NSAyMS4yOTI3IDIwLjkwNzQgMjYuNDA4OCAxOS4yNjgxIDI5LjQ2NTZDMTguODExOSAzMC4zMTc4IDE4LjA3MSAzMC44NDM5IDE3LjIzNjEgMzAuODU2OEMxNC4wODE4IDMwLjkwODUgMTEuNDU1NSAyNS4xMDE1IDEzLjIyNDggMjEuNDU3M0gxMy4yMjIxWk0zMS4zMjk2IDQ0LjQ1MjZDMzEuMDgzNiA0NC42OTE1IDMwLjY0NCA0NC43OTggMzAuMzEyMyA0NC43ODE5TDI3LjU3NTQgNDQuNjMwMkwyNi41MTExIDQ0LjYwNDRDMjYuNDU1OCA0NC41MDQzIDI2LjQ4MDcgNDQuMTgxNSAyNi41NDk4IDQ0LjExMzdDMjYuNjQ2NSA0NC4wMTY5IDI2LjcyNCA0My45ODE0IDI3LjA1NTcgNDMuOTAzOUwyNy4xMjIgNDIuOTEyOUMyNy4xNjA3IDQyLjM0NDggMjYuOTg2NiA0MS44NTEgMjYuNjk5MSA0MS40MjQ5QzI2LjE4NzYgNDAuNjY2NCAyNi4xMTAyIDM5LjcyMzggMjYuNDgzNCAzOC44NzE3TDI2Ljc2NTQgMzguMDM4OUMyNi44ODE1IDM3LjY5NjcgMjYuNjI0NCAzNy40NTQ2IDI2LjM2MTggMzcuMzczOUwyNS44OTc0IDM3LjIzMTlDMjUuNjcwNyAzNi45ODMzIDI1LjU5MzMgMzYuNDc5OCAyNS42MjkyIDM2LjEzMTJDMjYuMDQxMSAzNi4wMzExIDI2LjI1NCAzNS44Nzk0IDI2LjUyNzcgMzUuNTM0QzI2LjY4MjUgMzUuMzMzOSAyNy4wNjk1IDM1LjI2MjkgMjcuMzEyOCAzNS4yMjc0TDI3LjQyNjEgMzQuMjU1OEMyNy44MjQyIDM0LjUxNzMgMjcuOTEyNyAzNC45OTE3IDI4LjE5NDcgMzUuMzI0MkMyOC42MTIxIDM1LjgxNDkgMjguOTYwNCAzNi4zMjE2IDI5LjAwNzQgMzcuMDY3M0MyOS4wNjI3IDM3Ljk1NDkgMjkuNDkxMiAzOC41NjUgMzAuMTM1NCAzOS4wMTM3QzMyLjEyNTggNDAuNDA0OSAzMi40MjcyIDQzLjM5MzkgMzEuMzMyNCA0NC40NTkxTDMxLjMyOTYgNDQuNDUyNlpNMzkuMzIxOSA0MC44NDA3QzM4LjgyNDIgNDMuMjc3NyAzNy4wNjg4IDQ0LjkyNzEgMzQuOTQ1NiA0NS4xNTk1QzM0LjAwNTcgNDUuMjYyOCAzMy4xMSA0NS4wNjI3IDMyLjE3MDEgNDQuNzAxMkMzMy4xMTgzIDQyLjk5MDQgMzIuNzQyMyA0MS4wOTI0IDMxLjY3MjQgMzkuNjMzNEMzMS4yNDY3IDM5LjA1MjQgMzAuODI2NSAzOC40NzE0IDMwLjUzMzUgMzcuNzgzOUMzMC4yNTE1IDM3LjExODkgMzAuMjIzOCAzNi4zOTI2IDMwLjE3NjggMzUuNjY2NEwyOS44NTA2IDMzLjYzNkMyOS43NDgzIDMyLjk5NjkgMjkuNzEyNCAzMi4zMjg4IDI5LjkwODcgMzEuNzAyNUMzMC4xMjE1IDMxLjAyMTUgMzEuMjEzNSAzMS41NTczIDMxLjcwMDEgMzEuMTE1MUMzMi4xNDc5IDMwLjcxMTYgMzIuNDkwNyAyOS42MzAzIDMyLjM3MTkgMjkuMDEwNUwzMS4wODA4IDI4Ljc3ODFDMzAuNzUxOSAyOC43MiAzMC42ODI3IDI4LjUwNyAzMC41NDczIDI4LjE3NzdDMzAuNDA5MSAyNy44NDg1IDI5LjkzOTEgMjcuNjgzOCAyOS42NjI2IDI3LjU3NzNMMjkuNTc5NyAyNi41MjVDMjkuMDczOCAyNi44MDkxIDI4Ljk5MzYgMjcuNDQ1IDI4LjY3MDIgMjcuNTQ1QzI4LjQ0MzUgMjcuNjE2MSAyOC40NzM5IDI2Ljk1NzYgMjguMTE3MyAyNi41MzE1QzI3LjczODUgMjcuMDIyMSAyNy42MTk3IDI3LjUyMjUgMjcuNDc4NyAyOC4xMjI4TDI3LjExMzggMjguNjAwNkMyNi40MDA1IDI5LjUzNjYgMjYuNSAzMS41NDc2IDI1LjM2MSAzMy4xMDAyTDIzLjk3MzMgMzQuNjY1N0MyMy4xMTA3IDM1LjYzNzMgMjIuMzAzNSAzNi42MDI1IDIxLjc0NzggMzcuODQ1MkMyMS4wNzA1IDM5LjM1NTggMjAuODYwNCA0MC45NTY5IDIxLjE1MDcgNDIuNjk5OUMyMC40NzA2IDQyLjA2MDggMjAuMjE5IDQxLjE5MjUgMjAuMDg5MSA0MC4yNDAzQzE5LjcyOTcgNDAuOTQwNyAxOS44MDQ0IDQxLjcxMjIgMTkuOTg2OCA0Mi4zOTk3QzIwLjMxNTggNDMuNjQyNCAyMS4wNzA1IDQ0LjUyMDQgMjIuMDMyNiA0NS4xNzU3QzE5Ljg1NDEgNDUuMjcyNSAxNy45MjczIDQ0LjA5NDQgMTcuMDc1OCA0MS44MjE5QzE2LjE1OCAzOS4zNjg3IDE2LjY5NDMgMzYuNTczNCAxOC4wMDQ3IDM0LjQxMDdDMTguNjM1IDMzLjM2ODEgMTkuMzg2OSAzMi41Mjg5IDIwLjIzMDEgMzEuNzIxOUMyMS4xMDkyIDMwLjg4MjcgMjEuNzY0NCAyOS44OTgyIDIyLjQwMDIgMjguODA3MUwyMy40MjA0IDI3LjA2MDlDMjQuNTE1MSAyNS40NDY5IDI2LjE0MDYgMjQuNDY4OSAyNy44NDYzIDI0LjQwMTFDMjkuNjUxNiAyNC4zMzAxIDMxLjMzNzkgMjUuMjA4MSAzMi41MzIyIDI2LjgwOTFDMzMuODcwMiAyOC42MDA2IDM0LjA0NzIgMzAuMjUzMiAzNi40NzE2IDMyLjUyNTdDMzguNjY5NCAzNC41ODUgMzkuOTk2NCAzNy41NjQ0IDM5LjMyNzQgNDAuODQwN0gzOS4zMjE5Wk00MS4zNzg3IDI5LjY1MjhDNDAuMDkzMiAzMS4wNDQxIDM4LjE5NjcgMzEuNDE4NSAzNy4wNjYgMjkuODAxM0MzNS4wNzgzIDI2Ljk2NCAzNi43NjE5IDIxLjEyOCA0MC4wMDE5IDIwLjA2NjFDNDEuMTE4OCAxOS42OTgxIDQyLjI1NzggMjAuMjA0OSA0Mi44NjYgMjEuMzc2NkM0NC4xODc0IDIzLjkxMzcgNDMuMjQ3NSAyNy42MzIyIDQxLjM3ODcgMjkuNjUyOFoiIGZpbGw9IiMxNDNDNkYiLz48L2c+PC9zdmc+");
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
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Ingredient</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Unit</th>
                  {DAYS.map(d => (
                    <th key={d} style={{ padding: "6px 6px", textAlign: "right" }}>{d}d</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r, i) => {
                  if (Number(r.dm_g) <= 0) return null;
                  const frac = Number(r.dm_g) / totalDM;
                  const ingDailyDM = frac * dailyDM;
                  const wf = Number(r.water_percent) / 100;
                  const ingFresh = wf < 1 ? ingDailyDM / (1 - wf) : ingDailyDM;
                  return (
                    <tr key={i} style={{ background: i % 2 ? "#fff" : "#E0F2FF", borderBottom: "1px solid #A6CCE8" }}>
                      <td style={{ padding: "5px 8px" }}>{r.ingredient}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: "#3C6293" }}>g</td>
                      {DAYS.map(d => (
                        <td key={d} style={{ padding: "5px 6px", textAlign: "right", fontFamily: "monospace" }}>{(ingFresh * d).toFixed(1)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Diet Nutrient Composition */}
            <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "16px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "6px", marginBottom: "12px" }}>Diet Nutrient Composition</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "28px" }}>
              <thead>
                <tr style={{ background: "#143C6F", color: "#fff" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Nutrient</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Unit</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Dry Matter Basis</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Per 1000 Kcal DM</th>
                </tr>
              </thead>
              <tbody>
                {unifiedSections
                  .filter(section => section.rows.some(row => row.val != null))
                  .map(section => (
                  <React.Fragment key={section.cat}>
                    <tr>
                      <td colSpan={4} style={{ padding: "6px 8px", background: "#BEE2FB", color: "#211915", fontWeight: 800 }}>{section.cat}</td>
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

            {/* Appendix — Preparing Your Pet's Paw-Balancer Recipe */}
            <div style={{ breakBefore: "page", paddingTop: "8px" }}>
              <p style={{ color: "#143C6F", textTransform: "uppercase", fontSize: "18px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "8px", marginBottom: "16px" }}>
                Appendix — Preparing Your Pet's Paw-Balancer Recipe
              </p>
              <p style={{ fontSize: "12px", color: "#211915", marginBottom: "14px" }}>
                To ensure the diet is prepared as formulated, please follow these instructions carefully.
              </p>

              {[
                {
                  title: "Step 1: Weigh all ingredients before cooking",
                  body: [
                    "All ingredient amounts provided in your Paw-Balancer recipe are listed on a raw (uncooked) weight basis. The only exception is the boiled egg.",
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

        {/* Ingredients section — always visible, sits above the nutrient table */}
        <p className="text-[#143C6F] uppercase" style={{ fontSize: "26px", fontWeight: 700, borderBottom: "1.5px solid #211915", paddingBottom: "10px", marginBottom: "24px", letterSpacing: "0.02em" }}>Ingredients</p>
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
                      {r.ingredient}
                    </span>
                  ))}
                </div>
              </div>

              {/* COL 2: Additional Ingredients — 3-column grid */}
              <div>
                <p className="text-[#211915]" style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>Possible Additions for Diet Balancing</p>
                <div style={{ background: "#E0F2FF", border: "1.5px solid #A6CCE8", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "20px", height: "20px", borderRadius: "50%", background: "#3C6293", color: "#fff", fontSize: "12px", fontWeight: 700, marginTop: "1px" }}>i</span>
                  <p style={{ fontSize: "14px", color: "#211915", fontWeight: 600, lineHeight: 1.55, margin: 0 }}>
                    Not all of the ingredients listed below will be used. Paw-Balancer will automatically select only the ingredients necessary to formulate a complete and balanced diet based on your selected ingredients.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {shuffledFixed.map(r => {
                    const name = r.ingredient.toLowerCase().includes("eggshell")
                      ? "Eggshells / Calcium Carbonate"
                      : r.ingredient.toLowerCase().includes("oyster")
                      ? "Oyster"
                      : r.ingredient;
                    return (
                      <span key={r.ingredient} className="bg-[#FA9A36] text-[#211915] text-[14px] font-bold px-4 py-3 rounded-full text-center">
                        {name}
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
                    <th className="uppercase tracking-wider" style={{ width: "30%", padding: "14px 16px", textAlign: "left", fontSize: "15px", fontWeight: 700 }}>Nutrient</th>
                    <th className="uppercase tracking-wider" style={{ width: "14%", padding: "14px 16px", textAlign: "left", fontSize: "15px", fontWeight: 700 }}>Unit</th>
                    <th className="uppercase tracking-wider" style={{ width: "13%", padding: "14px 16px", textAlign: "right", fontSize: "15px", fontWeight: 700 }}>Value</th>
                    <th className="uppercase tracking-wider" style={{ width: "15%", padding: "14px 16px", textAlign: "right", fontSize: "15px", fontWeight: 700 }}>AAFCO Min</th>
                    <th className="uppercase tracking-wider" style={{ width: "14%", padding: "14px 16px", textAlign: "right", fontSize: "15px", fontWeight: 700 }}>% of Min</th>
                    <th className="uppercase tracking-wider" style={{ width: "14%", padding: "14px 16px", textAlign: "center", fontSize: "15px", fontWeight: 700 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unifiedSections
                    .filter(section => section.rows.some(row => row.val != null))
                    .map(section => (
                    <React.Fragment key={section.cat}>
                      <tr>
                        <td colSpan={6} className="font-black uppercase tracking-wider" style={{ padding: "14px 16px", background: "#BEE2FB", color: "#211915", fontSize: "17px", fontWeight: 800 }}>
                          {section.cat}
                        </td>
                      </tr>
                      {section.rows
                        .filter(row => row.val != null)
                        .map(row => {
                        const minVal = (row.min != null && row.min !== "" && row.min !== 0) ? row.min : null;
                        // Use backend aafco_percent_of_minimum if available, else calculate
                        const aafcoPctRaw = (row as any).aafcoPct;
                        const pct = aafcoPctRaw != null
                          ? Number(aafcoPctRaw) * 100
                          : (row.val != null && minVal != null && minVal > 0)
                            ? (Number(row.val) / minVal) * 100
                            : null;
                        let badge;
                        if (pct === null)    badge = <span className="text-[#3C6293]" style={{ fontSize: "18px" }}>—</span>;
                        else if (pct >= 100) badge = <span className="text-[#3C6293] font-bold" style={{ fontSize: "20px" }}>✓</span>;
                        else if (pct >= 90)  badge = <span className="text-[#FF9D36] font-bold" style={{ fontSize: "20px" }}>⚠</span>;
                        else                 badge = <span className="text-[#AD0B39] font-bold" style={{ fontSize: "20px" }}>✗</span>;
                        const pctStr = pct != null ? pct.toFixed(1) + "%" : "—";
                        const dietVal = row.val != null ? Number(row.val).toFixed(row.dec ?? 2) : "—";
                        return (
                          <tr key={row.label} className="border-b border-[#A6CCE8] last:border-0 hover:bg-[#FFDCB7]/20 transition">
                            <td style={{ padding: "12px 16px", textAlign: "left", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.label}</td>
                            <td style={{ padding: "12px 16px", textAlign: "left", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.unit}</td>
                            <td className="font-mono font-semibold" style={{ padding: "12px 16px", textAlign: "right", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{dietVal}</td>
                            <td className="font-mono" style={{ padding: "12px 16px", textAlign: "right", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{minVal != null ? minVal : "—"}</td>
                            <td className="font-mono" style={{ padding: "12px 16px", textAlign: "right", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{pctStr}</td>
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
                { icon: "✓", label: "Meets minimum",        color: "#3C6293" },
                { icon: "⚠", label: "Within 10%\nof minimum", color: "#FF9D36" },
                { icon: "✗", label: "Below minimum",        color: "#AD0B39" },
                { icon: "—", label: "No AAFCO\nminimum",    color: "#3C6293" },
              ].map(({ icon, label, color }) => (
                <div key={icon} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "48px", fontWeight: 900, color, lineHeight: 1 }}>{icon}</span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#211915", textAlign: "center", whiteSpace: "pre-line" }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: "1px", background: "#A6CCE8", margin: "0 0 40px" }}></div>
        </div>

        {/* Daily Feeding Plan — always visible, internal pay-gate unchanged */}
        {(
          <div className="mt-8">

            {!feedPlanUnlocked ? (
              /* Pay gate → customer profile → disclaimer → payment */
              <CheckoutFlow
                onUnlock={() => setFeedPlanUnlocked(true)}
                petType={petType}
                dietType={dietType}
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
                        <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "17px", fontWeight: 700, textTransform: "uppercase" }}>Ingredient</th>
                        <th style={{ padding: "14px 10px", textAlign: "center", fontSize: "17px", fontWeight: 700, textTransform: "uppercase" }}>Unit</th>
                        {DAYS.map(d => (
                          <th key={d} style={{ padding: "14px 8px", textAlign: "right", fontSize: "19px", fontWeight: 700 }}>{d}Days</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shuffledBreakdown.map((r, i) => {
                        if (Number(r.dm_g) <= 0) return null;
                        const frac = Number(r.dm_g) / totalDM;
                        const ingDailyDM = frac * dailyDM;
                        const wf = Number(r.water_percent) / 100;
                        const ingFresh = wf < 1 ? ingDailyDM / (1 - wf) : ingDailyDM;
                        return (
                          <tr key={i} style={{ background: "#E0F2FF", borderBottom: "2px solid #3C6293" }}>
                            <td style={{ padding: "12px 16px", fontSize: "16px", fontWeight: 600, color: "#211915" }}>{r.ingredient}</td>
                            <td style={{ padding: "12px 10px", textAlign: "center", fontSize: "16px", fontWeight: 600, color: "#3C6293" }}>g</td>
                            {DAYS.map(d => (
                              <td key={d} style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace", fontSize: "15px", fontWeight: 600, color: "#211915" }}>{(ingFresh * d).toFixed(1)}</td>
                            ))}
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#143C6F", color: "#fff" }}>
                        <td style={{ padding: "14px 16px", fontSize: "15px", fontWeight: 700 }}>Total (g)</td>
                        <td style={{ padding: "12px 10px" }}></td>
                        {DAYS.map(d => {
                          const tot = breakdown.reduce((s, r) => {
                            if (Number(r.dm_g) <= 0) return s;
                            const frac = Number(r.dm_g) / totalDM;
                            const wf = Number(r.water_percent) / 100;
                            const ingFresh = wf < 1 ? (frac * dailyDM) / (1 - wf) : frac * dailyDM;
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
                        <th className="uppercase tracking-wider" style={{ width: "34%", padding: "14px 16px", textAlign: "left", fontSize: "15px", fontWeight: 700 }}>Nutrient</th>
                        <th className="uppercase tracking-wider" style={{ width: "14%", padding: "14px 16px", textAlign: "left", fontSize: "15px", fontWeight: 700 }}>Unit</th>
                        <th className="uppercase tracking-wider" style={{ width: "22%", padding: "14px 16px", textAlign: "right", fontSize: "15px", fontWeight: 700 }}>Dry Matter Basis</th>
                        <th className="uppercase tracking-wider" style={{ width: "30%", padding: "14px 16px", textAlign: "right", fontSize: "15px", fontWeight: 700 }}>Per 1000 Kcal DM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedSections
                        .filter(section => section.rows.some(row => row.val != null))
                        .map(section => (
                        <React.Fragment key={section.cat}>
                          <tr>
                            <td colSpan={4} className="font-black uppercase tracking-wider" style={{ padding: "14px 16px", background: "#BEE2FB", color: "#211915", fontSize: "17px", fontWeight: 800 }}>
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
                                <td style={{ padding: "12px 16px", textAlign: "left", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{row.unit}</td>
                                <td className="font-mono font-semibold" style={{ padding: "12px 16px", textAlign: "right", color: "#211915", fontSize: "15px", fontWeight: 600 }}>
                                  {row.val != null ? Number(row.val).toFixed(row.dec ?? 2) : "—"}
                                </td>
                                <td className="font-mono" style={{ padding: "12px 16px", textAlign: "right", color: "#211915", fontSize: "15px", fontWeight: 600 }}>{perKcalStr}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Print button — moved to the bottom, below the full report */}
                <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                  <button
                    onClick={() => window.print()}
                    className="hover:brightness-95 transition"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "8px",
                      background: "#143C6F", color: "#fff",
                      fontWeight: 700, fontSize: "15px",
                      padding: "12px 22px", borderRadius: "10px", border: "none", cursor: "pointer",
                    }}
                  >
                    🖨 Print / Save PDF
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[#3C6293] text-[13px] italic mt-4">Could not calculate feeding plan — diet energy unavailable.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3" style={{ marginTop: "36px" }}>
          <button
            onClick={onBack}
            className="bg-[#BEE2FB] text-[#143C6F] transition hover:brightness-95"
            style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "18px", padding: "18px 28px", borderRadius: "12px" }}
          >
            Back to Ingredients
          </button>
          <button
            onClick={onReset}
            className="flex-1 bg-[#3C6293] text-white hover:bg-[#143C6F] transition-all hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center"
            style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "18px", padding: "18px 24px", borderRadius: "12px", letterSpacing: "0.02em" }}
          >
            New Profile
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
          onClick={() => onChange(o.value)}
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

function inputCls(error: boolean) {
  return `w-full h-[64px] px-4 rounded-[10px] text-[21px] font-bold text-[#211915] bg-[#E0F2FF] outline-none transition-all ${
    error ? "shadow-[0_0_0_2px_#B02424]" : "focus:shadow-[0_0_0_2px_#3C6293]"
  }`;
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
                <p key={i} className="text-[#143C6F]" style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 900, fontSize: "18px", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: "6px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "meta") {
              return (
                <p key={i} className="text-[#3C6293]" style={{ fontSize: "12px", fontStyle: "italic", marginBottom: "16px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "important") {
              return (
                <p key={i} className="text-[#AD0B39]" style={{ fontWeight: 800, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.01em", marginBottom: "20px", lineHeight: 1.6 }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "heading") {
              return (
                <p key={i} className="text-[#143C6F] uppercase" style={{ fontWeight: 800, fontSize: "14px", letterSpacing: "0.03em", borderBottom: "1px solid #A6CCE8", paddingBottom: "5px", marginTop: "22px", marginBottom: "10px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "shout") {
              return (
                <p key={i} className="text-[#211915] uppercase" style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.01em", lineHeight: 1.7, marginBottom: "10px" }}>
                  {item.text}
                </p>
              );
            }
            if (item.type === "bullet") {
              return (
                <p key={i} className="text-[#211915]" style={{ fontSize: "13px", lineHeight: 1.6, marginBottom: "5px", paddingLeft: "16px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0 }}>•</span>{item.text}
                </p>
              );
            }
            return (
              <p key={i} className="text-[#211915]" style={{ fontSize: "13px", lineHeight: 1.7, marginBottom: "12px" }}>
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
            I have read and agree to the Paw-Balancer Liability Disclaimer and Limitation of Liability.
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
  redirecting,
}: {
  customer: CustomerInfo;
  onBack: () => void;
  onContinue: () => void;
  redirecting: boolean;
}) {
  return (
    <div className="border-[1.5px] border-[#3C6293] rounded-[12px] overflow-hidden" style={{ marginTop: "16px" }}>
      <div className="bg-[#143C6F]" style={{ padding: "22px 28px" }}>
        <p className="text-white font-bold" style={{ fontFamily: "'Parastoo', sans-serif", fontSize: "20px" }}>Payment</p>
        <p className="text-[#FFC588] font-semibold" style={{ fontSize: "14px", marginTop: "4px" }}>Daily Feeding Plan unlock — {PLAN_PRICE_LABEL}</p>
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
          You'll be taken to Stripe's secure checkout to enter your card details. Paw-Balancer never sees or stores your card information.
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
            onClick={onContinue}
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
      </div>
    </div>
  );
}
function CheckoutFlow({
  onUnlock: _onUnlock,
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

  function goToStripeCheckout() {
    if (!customer) return;
    setRedirecting(true);

    // Persist everything needed to restore this exact wizard state once the
    // user comes back from Stripe's hosted checkout (a full-page redirect
    // wipes React state, since there's no backend session here).
    try {
      sessionStorage.setItem(
        CHECKOUT_STORAGE_KEY,
        JSON.stringify({ petType, dietType, profile, selectedIngredients, result, allIngredients })
      );
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — payment still
      // works, the user just won't auto-return to an unlocked plan.
    }

    const url = new URL(STRIPE_PAYMENT_LINK);
    if (customer.email) url.searchParams.set("prefilled_email", customer.email);
    // Stripe's Payment Link "after payment" redirect (set in the Stripe
    // Dashboard for this link) should point back to this page with
    // ?paw_payment=success so the app knows to unlock the plan on return.
    window.location.href = url.toString();
  }

  if (stage === "gate") {
    return (
      <div className="bg-[#FFDCB7] border-[1.5px] border-[#FFB160] rounded-[12px] flex flex-col sm:flex-row items-center justify-between" style={{ padding: "28px 32px", gap: "20px", marginTop: "16px" }}>
        <div>
          <p className="font-bold text-[#143C6F]" style={{ fontSize: "20px" }}>🔓 Unlock Your Daily Feeding Plan</p>
          <p className="text-[#211915] font-semibold" style={{ fontSize: "15px", marginTop: "6px" }}>Get exact fresh weight quantities for 1, 3, 5, 7, 10, 15, 20, 25 and 30-day batches.</p>
        </div>
        <button
          onClick={() => setStage("customer")}
          className="bg-[#143C6F] hover:bg-[#FF9D36] text-white transition whitespace-nowrap shrink-0"
          style={{ fontFamily: "'Parastoo', sans-serif", fontWeight: 700, fontSize: "16px", padding: "16px 28px", borderRadius: "12px" }}
        >
          Unlock Plan
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

  // stage === "payment" — the actual "unlock" now happens when the user
  // returns from Stripe with ?paw_payment=success (handled by the parent).
  return (
    <StripeCheckoutPanel
      customer={customer!}
      onBack={() => setStage("disclaimer")}
      onContinue={goToStripeCheckout}
      redirecting={redirecting}
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
export function DogDietCalculator({ visible }: { visible: boolean }) {
  const [petType, setPetType] = useState<PetType>("dog");
  const [dietType, setDietType] = useState<DietType>("conventional");
  // page 1 = Choose Your Pet, 2 = Select a Diet Type, 3 = Profile, 4 = Ingredients, 5 = Results
  const [page, setPage] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [profile, setProfile] = useState<ReturnType<typeof buildProfile> | ReturnType<typeof buildCatProfile> | null>(null);
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
        setPage(5);
        setRestoredFeedPlanUnlocked(true);
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
    setPage(5);
    setResult(null);
    setCalculating(true);
    setCalcErrors("");
    scrollToTop();

    try {
      const res = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const errorIssues = (data.issues ?? []).filter((i: string) => i.startsWith("ERROR"));
      if (errorIssues.length > 0) {
        setCalcErrors(errorIssues.map((i: string) => i.replace(/^ERROR:\s*/, "")).join(" "));
        setPage(4);
        setCalculating(false);
        return;
      }
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ issues: [`Calculation failed: ${msg}`] } as CalcResult);
    }
    setCalculating(false);
  }

  // "Start Over" from the Results page — restarts the current pet/diet's wizard from the Profile step
  function reset() {
    setPage(3);
    setProfile(null);
    setResult(null);
    setSelectedIngredients([]);
    setSavedSelected([]);
    setCalcErrors("");
    scrollToTop();
  }

  // Returns all the way to the home screen (Choose Your Pet), the only place
  // the pet/diet selection UI is shown again
  function goHome() {
    setPage(1);
    setProfile(null);
    setResult(null);
    setSelectedIngredients([]);
    setSavedSelected([]);
    setCalcErrors("");
    scrollToTop();
  }

  function selectPet(type: PetType) {
    setPetType(type);
    setDietType("conventional");
    setPage(2);
    setProfile(null);
    setResult(null);
    setSelectedIngredients([]);
    setCalcErrors("");
    scrollToTop();
  }

  function selectDiet(type: DietType) {
    setDietType(type);
    setPage(3);
    setProfile(null);
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
    <section id="calculator" className="bg-[#F4F4F4] py-[88px]" ref={sectionRef} style={{ animation: "dietBoxIn 0.45s ease both" }}>
      <style>{`
        @keyframes dietBoxIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="mx-auto max-w-[1280px] px-[63px]" style={{ maxWidth: "1280px", margin: "0 auto", paddingLeft: "63px", paddingRight: "63px", width: "100%" }}>
        {/* Step indicator for the 4 numbered steps; the Results page has none */}
        {page <= 4 && <StepIndicator step={page} />}

        {/* Step 1: Choose Your Pet — only shown on this step, unless the user goes back to Home */}
        {page === 1 && (
          <div className="text-center mb-10" style={{ textAlign: "center", marginBottom: "48px" }}>
            <p
              className="text-[#143C6F]"
              style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(28px, 3.5vw, 38px)", fontWeight: 700, marginBottom: "40px" }}
            >
              Choose Your Pet
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
          </div>
        )}

        {/* Step 2: Select a Diet Type — only shown on this step, unless the user goes back to Home */}
        {page === 2 && (
          <div className="text-center mb-10" style={{ textAlign: "center", marginBottom: "48px" }}>
            <p
              style={{
                fontFamily: "'Marcellus', serif",
                fontWeight: 700,
                fontSize: "clamp(26px, 3.2vw, 36px)",
                color: "#DE7100",
                marginBottom: "24px",
              }}
            >
              Select a Diet Type
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
            <div style={{ marginTop: "28px" }}>
              <button type="button" onClick={goHome} className="text-[#3C6293] font-semibold" style={{ fontSize: "16px", textDecoration: "underline" }}>
                ← Back to Home
              </button>
            </div>
          </div>
        )}

        {/* Steps 3–5: Profile, Ingredients, Results — pet/diet selection UI never shows here */}
        {page >= 3 && (
          <>
            <div className="text-center" style={{ textAlign: "center", marginBottom: "40px" }}>
              <button type="button" onClick={goHome} className="text-[#3C6293] font-semibold" style={{ fontSize: "16px", textDecoration: "underline", marginBottom: "16px", display: "inline-block" }}>
                ← Back to Home
              </button>
              <h2
                className="text-[#143C6F] font-normal"
                style={{ fontFamily: "'Marcellus', serif", fontSize: "clamp(32px, 4.6vw, 52px)", lineHeight: 1.2, textAlign: "center" }}
              >
                Build your {petType}&rsquo;s {dietLabel} diet
              </h2>
            </div>

            <div className="shadow-[0_8px_48px_rgba(28,24,20,0.13)] rounded-[16px]">
              {page === 3 && petType === "dog" && (
                <ProfilePage
                  onNext={p => {
                    setProfile(p);
                    setPage(4);
                    scrollToTop();
                  }}
                />
              )}
              {page === 3 && petType === "cat" && (
                <CatProfilePage
                  onNext={p => {
                    setProfile(p);
                    setPage(4);
                    scrollToTop();
                  }}
                />
              )}
              {page === 4 && (
                <IngredientsPage
                  onBack={() => { setPage(3); scrollToTop(); }}
                  onCalculate={handleCalculate}
                  onIngredientsLoaded={setAllIngredients}
                  apiBase={API_BASE}
                  initialSelected={savedSelected}
                  onSelectionChange={(s) => { setSavedSelected(s); setCalcErrors(""); }}
                  serverError={calcErrors}
                />
              )}
              {page === 5 && profile && (
                <ResultsPage
                  profile={profile}
                  result={calculating ? null : result}
                  selectedIngredients={selectedIngredients}
                  allIngredients={allIngredients}
                  onBack={() => { setPage(4); scrollToTop(); }}
                  onReset={reset}
                  petType={petType}
                  dietType={dietType}
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
