import { useState } from 'react'
import './FAQSection.css'

type FAQItem = { q: string; a: string | string[] }
type FAQCategory = { category: string; items: FAQItem[] }

const FAQ_DATA: FAQCategory[] = [
  {
    category: 'General',
    items: [
      {
        q: 'What is FurTuner?',
        a: 'FurTuner is an online diet formulation platform that creates complete and balanced homemade diets for healthy adult dogs and cats using real, human-grade food ingredients. The platform formulates diets to meet AAFCO nutrient requirements without relying on multivitamin or multimineral supplements.',
      },
      {
        q: 'How is FurTuner different from other pet diet formulation platforms?',
        a: 'Unlike many platforms that depend on proprietary supplements to balance diets, FurTuner uses whole food ingredients to provide nutrients. Users can choose from over 120 food ingredients and receive customized recipes tailored to their pets.',
      },
      {
        q: 'Who developed FurTuner?',
        a: 'FurTuner was developed by Amer AbuGhazaleh, a professor of animal nutrition at Southern Illinois University with more than 25 years of experience in animal nutrition research and education.',
      },
      {
        q: 'Is FurTuner suitable for both dogs and cats?',
        a: 'Yes. FurTuner can formulate diets for healthy adult dogs and healthy adult cats.',
      },
    ],
  },
  {
    category: 'Diet Formulation',
    items: [
      {
        q: 'How does FurTuner create balanced diets?',
        a: 'The platform uses nutrient composition data from the USDA food database and advanced formulation algorithms to create recipes that meet AAFCO nutrient recommendations for healthy adult dogs and cats.',
      },
      {
        q: 'Do I need to purchase supplements to balance the diets?',
        a: 'No. FurTuner is specifically designed to formulate balanced diets using food ingredients rather than proprietary supplement products.',
      },
      {
        q: 'What ingredients can I use?',
        a: 'FurTuner includes more than 120 food ingredients, including meats, fish, vegetables, fruits, grains, legumes, eggs, dairy products, oils, and other human-grade foods.',
      },
      {
        q: 'Can I choose my own ingredients?',
        a: 'Yes. Users select the ingredients they want to use, and FurTuner generates a balanced recipe using those selections.',
      },
      {
        q: 'Does FurTuner support grain-free diets?',
        a: 'Yes. Users can formulate grain-free diets if desired.',
      },
      {
        q: 'Does FurTuner support meat-based diets?',
        a: 'Yes. Users can formulate diets with higher levels of animal-based ingredients.',
      },
    ],
  },
  {
    category: 'Nutritional Adequacy',
    items: [
      {
        q: 'Do the diets meet AAFCO requirements?',
        a: 'FurTuner formulates diets to meet AAFCO nutrient recommendations for healthy adult dogs and cats.',
      },
      {
        q: 'Are amino acids, vitamins, and minerals considered during formulation?',
        a: 'Yes. The formulation process considers essential amino acids, vitamins, minerals, fatty acids, and other nutrients required by dogs and cats.',
      },
      {
        q: 'How accurate are the nutrient calculations?',
        a: 'Nutrient values are based on USDA food composition data and established nutrient databases. Actual nutrient concentrations may vary depending on ingredient source, storage, processing, and cooking methods.',
      },
    ],
  },
  {
    category: 'Feeding and Preparation',
    items: [
      {
        q: 'Are the recipes cooked or raw?',
        a: 'Users may choose their preferred feeding style. However, FurTuner generally recommends proper food handling and cooking practices to reduce food safety risks.',
      },
      {
        q: 'How much food should I feed my pet?',
        a: "The platform estimates daily food amounts based on your pet's body weight and other information provided during formulation. Owners can then adjust food intake based on pet performance (e.g. body weight).",
      },
      {
        q: 'Can I prepare meals in advance and freeze them?',
        a: 'Yes. Many users prepare larger batches and freeze portions for later use.',
      },
      {
        q: 'How long can prepared diets be stored?',
        a: 'Storage time depends on ingredients and preparation methods. Follow food safety guidelines for refrigeration and freezing.',
      },
    ],
  },
  {
    category: 'Health and Safety',
    items: [
      {
        q: 'Is FurTuner intended for pets with medical conditions?',
        a: 'No. FurTuner is intended for healthy adult dogs and cats. Pets with medical conditions should be evaluated by a veterinarian before dietary changes are made.',
      },
      {
        q: 'Can FurTuner formulate veterinary therapeutic diets?',
        a: 'Not at this time. The platform is designed for healthy adult pets and is not intended to replace veterinary-prescribed therapeutic diets.',
      },
      {
        q: 'What should I do if my pet experiences digestive upset or other unusual signs after starting a new diet?',
        a: 'Stop feeding the diet and consult your veterinarian immediately. Any diet change should be introduced gradually whenever possible.',
      },
    ],
  },
  {
    category: 'Payment and Access',
    items: [
      {
        q: 'When do I pay for the diet?',
        a: 'You can review the formulated recipe before making a purchase. Payment is required only after you decide to proceed.',
      },
      {
        q: 'Can I generate multiple diets?',
        a: 'Yes. Users can formulate multiple diets and compare different ingredient combinations.',
      },
      {
        q: 'Can I modify a recipe after it is generated?',
        a: 'Yes. Users can adjust ingredient selections and generate a new balanced formulation.',
      },
    ],
  },
  {
    category: 'Science and Transparency',
    items: [
      {
        q: 'What database does FurTuner use?',
        a: 'FurTuner uses nutrient composition data primarily derived from the USDA FoodData Central database.',
      },
      {
        q: 'Why might nutrient levels differ from the values shown in the recipe?',
        a: 'Nutrient concentrations vary among food sources because of differences in growing conditions, animal breed, season, geographic location, storage conditions, processing methods, cooking temperature, and cooking time.',
      },
      {
        q: 'Does FurTuner guarantee exact nutrient concentrations in the final prepared diet?',
        a: 'No. Nutrient values are estimates based on food composition databases. Laboratory analysis is the only way to determine the exact nutrient content of a prepared diet.',
      },
    ],
  },
  {
    category: 'Unique Features',
    items: [
      {
        q: 'Why does FurTuner not rely on supplements?',
        a: 'Our goal is to formulate nutritionally complete diets using real foods whenever possible, giving pet owners greater flexibility and transparency in what they feed their pets.',
      },
      {
        q: 'What makes FurTuner unique?',
        a: [
          'Uses real food ingredients instead of proprietary supplements',
          '120+ human-grade ingredients',
          'AAFCO-based formulation',
          'Custom ingredient selection',
          'Multiple diet styles (conventional, grain-free, meat-based)',
          'Transparent nutrient calculations',
          'Expert-developed formulation system',
          'Pay only after reviewing your recipe',
        ],
      },
      {
        q: 'Who is FurTuner for?',
        a: "FurTuner is ideal for pet owners who want greater control over their pets' nutrition and prefer preparing balanced homemade diets using real food ingredients.",
      },
    ],
  },
]

type Props = { visible: boolean }

export default function FAQSection({ visible }: Props) {
  const [openKey, setOpenKey] = useState<string | null>('0-0')

  if (!visible) return null

  return (
    <section className="faq-section" aria-label="Frequently Asked Questions">
      <h2 className="section-title">Frequently Asked Questions</h2>
      <p className="faq-intro">
        Everything you need to know about formulating balanced, homemade diets with FurTuner.
      </p>

      <div className="faq-categories">
        {FAQ_DATA.map((cat, ci) => (
          <div className="faq-category" key={cat.category}>
            <h3 className="faq-category-title">{cat.category}</h3>
            <div className="faq-list">
              {cat.items.map((item, qi) => {
                const key = `${ci}-${qi}`
                const isOpen = openKey === key
                return (
                  <div className={`faq-item ${isOpen ? 'faq-item--open' : ''}`} key={key}>
                    <button
                      className="faq-question"
                      onClick={() => setOpenKey(isOpen ? null : key)}
                      aria-expanded={isOpen}
                    >
                      <span>{item.q}</span>
                      <span className="faq-toggle-icon" aria-hidden="true">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="faq-answer">
                        {Array.isArray(item.a) ? (
                          <ul className="faq-answer-list">
                            {item.a.map((line, li) => (
                              <li key={li}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{item.a}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
