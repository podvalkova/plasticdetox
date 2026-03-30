// ==================== DATA ====================

const categories = [
  {
    id: "essentials",
    name: "The Big 5",
    icon: "⚡",
    description: "These 5 swaps make the biggest difference for your health.",
    doneText: "These 5 changes alone can cut your plastic exposure by nearly half.",
    questions: [
      {
        icon: "🥤",
        text: "Do you drink from plastic water bottles?",
        alt: "<strong>Switch to a stainless steel or glass bottle.</strong><span class='alt-swap'>Try: Any 18/8 stainless steel bottle — Klean Kanteen, Hydro Flask, or a simple steel bottle from a local store.</span>Plastic bottles leach BPA, phthalates, and microplastics — especially when warm or reused."
      },
      {
        icon: "🍱",
        text: "Do you heat food in plastic containers?",
        alt: "<strong>Use glass or ceramic containers for heating.</strong><span class='alt-swap'>Try: Glass food storage containers with silicone-sealed lids. Even a regular ceramic plate works as a cover.</span>Heating plastic releases up to 55x more microplastics. This is one of the highest-exposure habits."
      },
      {
        icon: "🛒",
        text: "Do you use plastic bags when shopping?",
        alt: "<strong>Keep reusable bags in your car, bag, or by the door.</strong><span class='alt-swap'>Try: Cotton tote bags or recycled-material shopping bags. Keep one folded in every bag you carry.</span>The average plastic bag is used for 12 minutes but takes 500 years to decompose."
      },
      {
        icon: "☕",
        text: "Do you use disposable coffee cups or plastic lids?",
        alt: "<strong>Bring your own reusable cup.</strong><span class='alt-swap'>Try: A double-wall stainless steel travel mug. Most coffee shops give a discount for bringing your own cup.</span>Paper cups are lined with plastic. A single cup releases over 25,000 microplastic particles into your drink."
      },
      {
        icon: "🎬",
        text: "Do you buy plastic-wrapped food or cling film?",
        alt: "<strong>Use beeswax wraps, silicone lids, or glass containers.</strong><span class='alt-swap'>Try: Beeswax food wraps — they're reusable for about a year. Or simply use a plate as a lid.</span>Cling film transfers plasticizers directly into your food, especially fatty or acidic foods."
      }
    ]
  },
  {
    id: "kitchen",
    name: "Your Kitchen",
    icon: "🍳",
    description: "Let's look at what's hiding in your kitchen.",
    doneText: "Your kitchen is a big source of daily plastic contact with food. Every swap counts.",
    questions: [
      {
        icon: "🍳",
        text: "Do you cook with non-stick (Teflon) pans?",
        alt: "<strong>Switch to cast iron, stainless steel, or ceramic pans.</strong><span class='alt-swap'>Try: A cast iron skillet — it lasts a lifetime, gets better with use, and is naturally non-stick when seasoned.</span>Non-stick coatings contain PFAS (\"forever chemicals\") that break down into microplastics when scratched."
      },
      {
        icon: "🥄",
        text: "Do you use plastic cutting boards?",
        alt: "<strong>Use wood or bamboo cutting boards.</strong><span class='alt-swap'>Try: A solid hardwood cutting board (maple or walnut). They're naturally antimicrobial.</span>A single plastic cutting board can release millions of microplastic particles per year from knife cuts."
      },
      {
        icon: "🧽",
        text: "Do you use plastic sponges for dishes?",
        alt: "<strong>Switch to natural sponges, loofahs, or Swedish dishcloths.</strong><span class='alt-swap'>Try: Cellulose sponges, coconut fiber scrubbers, or Swedish dishcloths (compostable and last months).</span>Plastic sponges shed microfibers into your sink and eventually into waterways."
      },
      {
        icon: "🥡",
        text: "Do you store leftovers in plastic containers?",
        alt: "<strong>Switch to glass storage containers.</strong><span class='alt-swap'>Try: Borosilicate glass containers with snap lids — they go from freezer to oven safely.</span>Even BPA-free plastics leach chemicals into food, especially over time and with repeated washing."
      },
      {
        icon: "🫗",
        text: "Do you use a plastic kettle or plastic-lid blender?",
        alt: "<strong>Choose glass or stainless steel kettles and blenders.</strong><span class='alt-swap'>Try: A stainless steel kettle and a glass-jar blender. Hot liquids extract more chemicals from plastic.</span>Boiling water in a plastic kettle can release billions of nanoplastic particles per liter."
      },
      {
        icon: "🧴",
        text: "Do you use plastic dish soap bottles?",
        alt: "<strong>Try solid dish soap bars or refill stations.</strong><span class='alt-swap'>Try: A solid dish soap bar on a wooden dish — it lasts as long as 2-3 bottles and works great.</span>Simple swap that eliminates recurring single-use plastic from your kitchen."
      },
      {
        icon: "🥤",
        text: "Do you use plastic straws?",
        alt: "<strong>Go strawless or use reusable ones.</strong><span class='alt-swap'>Try: Stainless steel, glass, or bamboo straws. Or just drink from the glass — your lips work great.</span>500 million straws are used daily in the US alone. Reusable ones pay for themselves in a week."
      }
    ]
  },
  {
    id: "bathroom",
    name: "Your Bathroom",
    icon: "🚿",
    description: "The bathroom is full of hidden plastics. Let's find them.",
    doneText: "Bathroom products touch your skin daily — reducing plastic here protects you directly.",
    questions: [
      {
        icon: "🪥",
        text: "Do you use a plastic toothbrush?",
        alt: "<strong>Switch to a bamboo toothbrush.</strong><span class='alt-swap'>Try: Bamboo toothbrushes — they work identically and are compostable. Replace every 3 months like usual.</span>Over 1 billion plastic toothbrushes end up in landfills yearly in the US alone."
      },
      {
        icon: "🧴",
        text: "Do you use liquid soap/shampoo in plastic bottles?",
        alt: "<strong>Switch to bar soap and shampoo bars.</strong><span class='alt-swap'>Try: Shampoo bars, conditioner bars, and bar soap. They last longer and have zero plastic packaging.</span>Each bar replaces 2-3 plastic bottles. Many brands now make excellent bar versions."
      },
      {
        icon: "🧹",
        text: "Do you use synthetic-fabric loofahs or poufs?",
        alt: "<strong>Use a natural loofah, sisal cloth, or cotton washcloth.</strong><span class='alt-swap'>Try: A real loofah gourd — it's a natural plant that works perfectly as a scrubber and is fully compostable.</span>Plastic poufs shed microfibers every time you shower, going straight down the drain."
      },
      {
        icon: "🧻",
        text: "Do you use face wipes or makeup remover wipes?",
        alt: "<strong>Switch to reusable cotton pads and natural cleansers.</strong><span class='alt-swap'>Try: Reusable organic cotton rounds with micellar water or oil cleanser. Toss them in the wash.</span>Most wipes contain polyester (plastic). They don't break down and are the #1 cause of sewer blockages."
      },
      {
        icon: "🪒",
        text: "Do you use disposable plastic razors?",
        alt: "<strong>Switch to a safety razor with metal blades.</strong><span class='alt-swap'>Try: A stainless steel safety razor. Higher upfront cost but replacement blades cost pennies. Lasts decades.</span>2 billion disposable razors are thrown away annually in the US."
      },
      {
        icon: "🦷",
        text: "Do you use regular toothpaste in a plastic tube?",
        alt: "<strong>Try toothpaste tablets or toothpaste in glass jars.</strong><span class='alt-swap'>Try: Toothpaste tablets — chew one, brush normally. They come in compostable packaging.</span>Toothpaste tubes are very difficult to recycle due to mixed materials. Tablets eliminate this entirely."
      }
    ]
  },
  {
    id: "bedroom",
    name: "Your Bedroom & Clothes",
    icon: "👕",
    description: "What you wear and sleep in matters more than you think.",
    doneText: "Synthetic clothing is the #1 source of microplastic pollution in oceans. Your wardrobe matters.",
    questions: [
      {
        icon: "👕",
        text: "Are most of your clothes made from polyester, nylon, or acrylic?",
        alt: "<strong>Start choosing natural fibers when you replace clothes.</strong><span class='alt-swap'>Try: Cotton, linen, wool, hemp, or Tencel. You don't need to replace everything — just choose natural when you buy new.</span>A single load of synthetic laundry releases up to 700,000 microplastic fibers into waterways."
      },
      {
        icon: "🛏️",
        text: "Are your bed sheets or pillowcases synthetic (polyester)?",
        alt: "<strong>Switch to cotton, linen, or bamboo bedding.</strong><span class='alt-swap'>Try: 100% cotton or linen sheets. You spend 8 hours a night in bed — that's prolonged skin contact.</span>You breathe in and absorb microfibers from synthetic bedding throughout the night."
      },
      {
        icon: "🧺",
        text: "Do you wash synthetic clothes without a microfiber filter?",
        alt: "<strong>Use a microfiber-catching laundry bag or filter.</strong><span class='alt-swap'>Try: A Guppyfriend wash bag or a Filtrol filter for your washing machine. They catch 80-90% of microfibers.</span>This is one of the easiest ways to prevent microplastic pollution if you own synthetic clothes."
      },
      {
        icon: "🧸",
        text: "Do you have a synthetic (memory foam) pillow or mattress?",
        alt: "<strong>Consider natural latex, wool, or cotton alternatives for your next purchase.</strong><span class='alt-swap'>Try: Natural latex, organic cotton, or wool pillows. For mattresses, consider natural latex on your next replacement.</span>Memory foam off-gasses volatile compounds and breaks down into microplastics over time."
      }
    ]
  },
  {
    id: "kids",
    name: "If You Have Kids",
    icon: "👶",
    description: "Children are more vulnerable to plastic chemicals. Let's protect them.",
    doneText: "Children absorb more microplastics per pound of body weight. These swaps protect the most vulnerable.",
    questions: [
      {
        icon: "🍼",
        text: "Do your kids eat or drink from plastic plates, cups, or bottles?",
        alt: "<strong>Switch to stainless steel or silicone alternatives.</strong><span class='alt-swap'>Try: Stainless steel cups and plates (they're lightweight and unbreakable too). Silicone is safer than hard plastic for little ones.</span>Babies fed from plastic bottles ingest millions of microplastic particles daily."
      },
      {
        icon: "🧸",
        text: "Are most of their toys plastic?",
        alt: "<strong>Choose wood, cotton, or natural rubber toys when replacing.</strong><span class='alt-swap'>Try: Wooden blocks, cotton stuffed animals, natural rubber balls. No need to toss everything — swap as things break or are outgrown.</span>Children put toys in their mouths constantly. Wooden and natural toys are safer and often last longer."
      },
      {
        icon: "🎒",
        text: "Does their lunch go to school in plastic containers or bags?",
        alt: "<strong>Use stainless steel bento boxes and cloth snack bags.</strong><span class='alt-swap'>Try: A stainless steel bento box with compartments — kids love them. Add reusable cloth bags for snacks.</span>A child's school lunch kit is an easy, high-impact place to eliminate daily plastic contact."
      },
      {
        icon: "👶",
        text: "Do you use disposable diapers or plastic-heavy baby products?",
        alt: "<strong>Consider cloth diapers or eco-disposables, and choose glass baby food jars.</strong><span class='alt-swap'>Try: Modern cloth diapers (they're much easier than old-school ones) or plant-based disposables. Glass containers for baby food.</span>A baby goes through ~6,000 diapers. Cloth saves money long-term and avoids chemicals against sensitive skin."
      }
    ]
  }
];

const resources = [
  {
    tag: "Human Health",
    title: "Microplastics found in human blood for the first time",
    source: "Environment International, 2022 — Vrije Universiteit Amsterdam",
    url: "https://doi.org/10.1016/j.envint.2022.107199"
  },
  {
    tag: "Human Health",
    title: "Discovery of microplastics in human lung tissue",
    source: "Science of The Total Environment, 2022 — Hull York Medical School",
    url: "https://doi.org/10.1016/j.scitotenv.2022.154907"
  },
  {
    tag: "Human Health",
    title: "Microplastics detected in human brain tissue at increasing concentrations",
    source: "Nature Medicine, 2025 — University of New Mexico",
    url: "https://doi.org/10.1038/s41591-024-03453-1"
  },
  {
    tag: "Human Health",
    title: "Microplastics in human placenta: potential threat to fetal development",
    source: "Environment International, 2021 — Università Politecnica delle Marche",
    url: "https://doi.org/10.1016/j.envint.2020.106274"
  },
  {
    tag: "Cardiovascular",
    title: "Microplastics and nanoplastics in arterial plaque linked to higher heart attack and stroke risk",
    source: "New England Journal of Medicine, 2024 — University of Campania",
    url: "https://doi.org/10.1056/NEJMoa2309822"
  },
  {
    tag: "Exposure",
    title: "Humans may ingest approximately 5 grams of plastic per week",
    source: "WWF International / University of Newcastle, 2019",
    url: "https://wwfint.awsassets.panda.org/downloads/plastic_ingestion.pdf"
  },
  {
    tag: "Food Contact",
    title: "Plastic bottles release microplastics into drinking water",
    source: "Frontiers in Chemistry, 2018 — State University of New York",
    url: "https://doi.org/10.3389/fchem.2018.00407"
  },
  {
    tag: "Food Contact",
    title: "Microwave heating of food in plastic containers increases microplastic release",
    source: "Environmental Science & Technology, 2023 — University of Nebraska–Lincoln",
    url: "https://doi.org/10.1021/acs.est.3c01942"
  },
  {
    tag: "Food Contact",
    title: "Plastic cutting boards release millions of microplastic particles annually",
    source: "Environmental Science & Technology, 2023 — North Dakota State University",
    url: "https://doi.org/10.1021/acs.est.3c00924"
  },
  {
    tag: "Endocrine Disruption",
    title: "Plasticizers and BPA as endocrine disruptors: links to reproductive and metabolic disorders",
    source: "The Lancet Diabetes & Endocrinology, 2020",
    url: "https://doi.org/10.1016/S2213-8587(20)30116-7"
  },
  {
    tag: "Children",
    title: "Infants fed from polypropylene bottles exposed to millions of microplastic particles daily",
    source: "Nature Food, 2020 — Trinity College Dublin",
    url: "https://doi.org/10.1038/s43016-020-00171-y"
  },
  {
    tag: "Clothing",
    title: "Washing synthetic textiles releases hundreds of thousands of microfibers per load",
    source: "Marine Pollution Bulletin, 2017 — Plymouth University",
    url: "https://doi.org/10.1016/j.marpolbul.2017.09.025"
  },
  {
    tag: "Kitchen",
    title: "Boiling water in plastic kettles releases billions of nanoplastics per liter",
    source: "Environmental Science & Technology Letters, 2021 — National Institute of Standards and Technology",
    url: "https://doi.org/10.1021/acs.estlett.1c00109"
  },
  {
    tag: "Environment",
    title: "Global plastic pollution crisis and pathways to reduction",
    source: "Science, 2020 — The Pew Charitable Trusts / SYSTEMIQ",
    url: "https://doi.org/10.1126/science.aba9475"
  },
  {
    tag: "Cancer Risk",
    title: "Association between plastic-derived chemicals and cancer risk in humans",
    source: "Journal of Hazardous Materials, 2023",
    url: "https://doi.org/10.1016/j.jhazmat.2023.131013"
  }
];

// ==================== STATE ====================

let currentCategory = 0;
let currentQuestion = 0;
let plasticScore = 0;
let totalQuestions = categories.reduce((sum, c) => sum + c.questions.length, 0);
let answeredCount = 0;
let swaps = []; // { category, question, alt }

// ==================== NAVIGATION ====================

function showHome() {
  document.getElementById("page-home").style.display = "block";
  document.getElementById("page-resources").style.display = "none";
  document.getElementById("nav-home").classList.add("active");
  document.getElementById("nav-resources").classList.remove("active");
  window.scrollTo(0, 0);
}

function showResources() {
  document.getElementById("page-home").style.display = "none";
  document.getElementById("page-resources").style.display = "block";
  document.getElementById("nav-home").classList.remove("active");
  document.getElementById("nav-resources").classList.add("active");
  renderResources();
  window.scrollTo(0, 0);
}

// ==================== RESOURCES ====================

function renderResources() {
  const grid = document.getElementById("resource-grid");
  grid.innerHTML = resources.map(r => `
    <div class="resource-card">
      <div class="resource-tag">${r.tag}</div>
      <div class="resource-title">${r.title}</div>
      <div class="resource-source">${r.source}</div>
      <a href="${r.url}" target="_blank" rel="noopener" class="resource-link">Read the study →</a>
    </div>
  `).join("");
}

// ==================== GAME ====================

function startGame() {
  document.getElementById("hero").style.display = "none";
  document.getElementById("game").style.display = "flex";
  currentCategory = 0;
  currentQuestion = 0;
  plasticScore = 0;
  answeredCount = 0;
  swaps = [];
  renderTracker();
  showQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restartGame() {
  document.getElementById("results").style.display = "none";
  document.getElementById("game").style.display = "none";
  document.getElementById("hero").style.display = "flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTracker() {
  const catEl = document.getElementById("tracker-categories");
  catEl.innerHTML = categories.map((c, i) => {
    let cls = "tracker-cat";
    if (i === currentCategory) cls += " active";
    if (i < currentCategory) cls += " done";
    return `<div class="${cls}"><span class="tracker-cat-dot"></span>${c.icon} ${c.name}</div>`;
  }).join("");

  // Update score ring
  const maxPossible = totalQuestions;
  const pct = maxPossible > 0 ? plasticScore / maxPossible : 0;
  const circumference = 326.7;
  const arc = document.getElementById("tracker-arc");
  arc.style.strokeDashoffset = circumference - (pct * circumference);

  // Color based on score
  if (pct > 0.6) arc.style.stroke = "#ef4444";
  else if (pct > 0.3) arc.style.stroke = "#f59e0b";
  else arc.style.stroke = "#22c55e";

  document.getElementById("tracker-number").textContent = plasticScore;
}

function updateProgress() {
  const pct = (answeredCount / totalQuestions) * 100;
  document.getElementById("progress-fill").style.width = pct + "%";

  const cat = categories[currentCategory];
  document.getElementById("progress-text").textContent =
    `Question ${currentQuestion + 1} of ${cat.questions.length} — ${answeredCount} of ${totalQuestions} total`;
}

function showQuestion() {
  const cat = categories[currentCategory];
  const q = cat.questions[currentQuestion];

  document.getElementById("question-card").style.display = "block";
  document.getElementById("alt-card").style.display = "none";
  document.getElementById("category-done").style.display = "none";
  document.getElementById("results").style.display = "none";

  document.getElementById("category-label").textContent = `${cat.icon} ${cat.name} — ${cat.description}`;
  document.getElementById("question-icon").textContent = q.icon;
  document.getElementById("question-text").textContent = q.text;

  // Re-trigger animation
  const card = document.getElementById("question-card");
  card.style.animation = "none";
  card.offsetHeight; // reflow
  card.style.animation = "fadeUp 0.35s ease";

  updateProgress();
  renderTracker();
}

function answer(type) {
  const cat = categories[currentCategory];
  const q = cat.questions[currentQuestion];

  answeredCount++;

  if (type === "yes") {
    plasticScore += 1;
    swaps.push({ category: cat.name, icon: q.icon, text: q.text, alt: q.alt });
    showAlternative(q.alt);
  } else if (type === "sometimes") {
    plasticScore += 0.5;
    swaps.push({ category: cat.name, icon: q.icon, text: q.text, alt: q.alt });
    showAlternative(q.alt);
  } else {
    // "no" — great, skip to next
    renderTracker();
    updateProgress();
    advanceQuestion();
  }
}

function showAlternative(altHtml) {
  document.getElementById("question-card").style.display = "none";
  document.getElementById("alt-card").style.display = "block";
  document.getElementById("alt-body").innerHTML = altHtml;

  const card = document.getElementById("alt-card");
  card.style.animation = "none";
  card.offsetHeight;
  card.style.animation = "fadeUp 0.35s ease";

  renderTracker();
  updateProgress();
}

function nextQuestion() {
  advanceQuestion();
}

function advanceQuestion() {
  const cat = categories[currentCategory];

  if (currentQuestion + 1 < cat.questions.length) {
    currentQuestion++;
    showQuestion();
  } else {
    showCategoryDone();
  }
}

function showCategoryDone() {
  const cat = categories[currentCategory];

  document.getElementById("question-card").style.display = "none";
  document.getElementById("alt-card").style.display = "none";
  document.getElementById("category-done").style.display = "block";
  document.getElementById("category-label").textContent = "";

  document.getElementById("category-done-icon").textContent = cat.icon;
  document.getElementById("category-done-title").textContent = `${cat.name} — Done!`;
  document.getElementById("category-done-text").textContent = cat.doneText;

  const isLast = currentCategory >= categories.length - 1;
  document.getElementById("category-done-btn").textContent = isLast ? "See Your Results →" : "Next: " + categories[currentCategory + 1].name + " →";

  renderTracker();
  updateProgress();
}

function nextCategory() {
  if (currentCategory + 1 < categories.length) {
    currentCategory++;
    currentQuestion = 0;
    showQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    showResults();
  }
}

function showResults() {
  document.getElementById("question-card").style.display = "none";
  document.getElementById("alt-card").style.display = "none";
  document.getElementById("category-done").style.display = "none";
  document.getElementById("category-label").textContent = "";
  document.getElementById("results").style.display = "block";

  const scoreEl = document.getElementById("results-subtitle");
  if (plasticScore <= 5) {
    scoreEl.textContent = `Nice! You scored ${plasticScore} out of ${totalQuestions}. You're already ahead of most people. Here are a few more things to consider:`;
  } else if (plasticScore <= 15) {
    scoreEl.textContent = `You scored ${plasticScore} out of ${totalQuestions}. You have some great opportunities to reduce your plastic exposure. Here's your personalized swap list:`;
  } else {
    scoreEl.textContent = `You scored ${plasticScore} out of ${totalQuestions}. Don't worry — most people score high here. The good news? Every swap makes a real difference. Here's where to start:`;
  }

  // Group swaps by category
  const grouped = {};
  swaps.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  const listEl = document.getElementById("results-list");

  if (swaps.length === 0) {
    listEl.innerHTML = `
      <div class="category-done" style="display:block;">
        <div class="category-done-icon">🌿</div>
        <h2 class="category-done-title">You're already plastic-free!</h2>
        <p class="category-done-text">Amazing — you've already made the swaps. Share this with someone who hasn't started yet.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="results-category">
      <div class="results-category-title">${cat}</div>
      ${items.map(item => `
        <div class="result-item">
          <div class="result-item-icon">${item.icon}</div>
          <div class="result-item-text">${item.alt}</div>
        </div>
      `).join("")}
    </div>
  `).join("");

  window.scrollTo({ top: 0, behavior: "smooth" });
}
