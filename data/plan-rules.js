/* ============================================================================
   PLAN RULES
   One rule per store subcategory. The plan engine reads these to decide what
   a given household actually needs, in what order, and at what cost.

   key      cat|sub, matching data/store-products.js exactly
   swap     the action, written as an instruction
   why      one line of reasoning, exposure first
   room     kitchen | bathroom | bedroom | laundry | nursery | whole | any
            "any" is never filtered out by room selection
   stage    all | expecting | baby | toddler | kid   (array, kids gating)
   needs    trigger id required to include this at all, or null
   rank     0 to 100 exposure priority. Higher runs first.
   est      typical spend in dollars for this swap
   free     the zero dollar alternative, or null if there genuinely is not one
   article  supporting article path, or null
   ============================================================================ */

window.PLAN_RULES = [

  /* ---------- KITCHEN AND WATER: the highest exposure surface ---------- */
  { key:"Food Storage|Food Storage", swap:"Stop heating and storing food in plastic", room:"kitchen", stage:"all", needs:null, rank:99, est:60,
    why:"The single biggest daily exposure. Heat and fat pull plastic straight into your food, and most kitchens do this two or three times a day.",
    free:"Before you buy anything: never microwave in plastic, and let food cool before it goes into a plastic container. That alone removes most of this exposure.",
    article:"articles/best-plastic-free-food-storage-containers.html" },

  { key:"Clean Water|Water Filters", swap:"Filter your drinking water", room:"kitchen", stage:"all", needs:null, rank:98, est:120,
    why:"Tap and bottled water both carry microplastics, PFAS, and heavy metals. Filtering is the highest impact single purchase on this list.",
    free:"No free version of this one. But stopping bottled water is free and removes about 240,000 particles per liter.",
    article:"articles/best-water-filters-for-microplastics-and-pfas.html" },

  { key:"Clean Water|Water Bottles", swap:"Carry a stainless or glass bottle", room:"kitchen", stage:"all", needs:null, rank:96, est:35,
    why:"Ends the daily habit of drinking from plastic, which sheds most when warm or reused. Also ends bottled water for good.",
    free:"Any glass jar with a lid works today. A mason jar is a water bottle.",
    article:"articles/best-non-toxic-water-bottles.html" },

  { key:"Cookware|Pans", swap:"Replace your nonstick pans", room:"kitchen", stage:"all", needs:"cook", rank:95, est:90,
    why:"Teflon and PTFE degrade with heat and scratches, into food you cook daily. Cast iron and stainless outlive you.",
    free:"Until you replace it: never preheat a nonstick pan empty, keep it below medium, and retire any pan that is scratched.",
    article:"articles/pfas-in-cookware-brands.html" },

  { key:"Cookware|Pots", swap:"Move your pots to stainless or enamel", room:"kitchen", stage:"all", needs:"cook", rank:94, est:110,
    why:"Pots hold hot liquid for long stretches, which is exactly when coatings break down. This is a buy once purchase.",
    free:"Use your oldest uncoated pot for anything simmering more than 20 minutes.",
    article:"articles/cast-iron-vs-stainless-steel-vs-ceramic-cookware.html" },

  { key:"Kitchen|Cutting Boards", swap:"Swap your plastic cutting board for wood", room:"kitchen", stage:"all", needs:"cook", rank:93, est:45,
    why:"Every knife cut sheds microplastic fragments into your food. One board can shed tens of millions of particles a year. Wood is naturally antimicrobial.",
    free:"Use a ceramic plate for cutting soft food until you replace the board.",
    article:"articles/best-non-toxic-cutting-boards.html" },

  { key:"Clean Water|Kettles", swap:"Retire the plastic electric kettle", room:"kitchen", stage:"all", needs:null, rank:92, est:55,
    why:"Boiling water inside a plastic lined kettle releases large amounts of nanoplastics into water you then drink hot.",
    free:"Boil in a stainless pot on the stove. Same water, no plastic, no purchase.",
    article:"articles/kitchen-detox-101.html" },

  { key:"Kitchen|Utensils", swap:"Replace black plastic utensils", room:"kitchen", stage:"all", needs:"cook", rank:91, est:30,
    why:"They soften against hot pans, and black plastic kitchenware has repeatedly tested positive for recycled electronic waste additives including flame retardants.",
    free:"Move the plastic ones to the back of the drawer and use whatever metal or wood you already own.",
    article:"articles/kitchen-detox-101.html" },

  { key:"Kitchen|Appliances", swap:"Get plastic out of your heat and prep gear", room:"kitchen", stage:"all", needs:"cook", rank:82, est:150,
    why:"Air fryers, blenders, toasters, and nonstick bakeware all put food against plastic or coatings at high heat, every single use.",
    free:"Use the oven and an uncoated sheet pan instead of the air fryer. Slower, and it costs nothing.",
    article:"articles/best-non-toxic-air-fryers.html" },

  { key:"Kitchen|Cleaning", swap:"Switch kitchen cleaning to plastic free", room:"kitchen", stage:"all", needs:null, rank:69, est:35,
    why:"Melamine and polyester sponges shed directly onto the surfaces your food touches, and conventional sprays add synthetic fragrance to the room you eat in.",
    free:"Cut an old cotton t shirt into cloths. Vinegar and water cleans most kitchen surfaces.",
    article:"articles/kitchen-detox-101.html" },

  { key:"Kitchen|Board Care", swap:"Maintain your wood board properly", room:"kitchen", stage:"all", needs:"cook", rank:48, est:18,
    why:"An unoiled wood board cracks and harbors bacteria, which is what sends most people back to plastic.",
    free:"Food grade mineral oil from any pharmacy does the same job as a branded board butter.",
    article:"articles/best-non-toxic-cutting-boards.html" },

  /* ---------- DRINKS ---------- */
  { key:"Tea|Loose Leaf", swap:"Ditch plastic tea bags", room:"kitchen", stage:"all", needs:"tea", rank:97, est:20,
    why:"One plastic tea bag can release over 11 billion microplastic particles into a single cup, one of the largest single exposures there is.",
    free:"Cut open the bags and steep the leaves loose, then strain. Works with the tea you already own.",
    article:"articles/how-to-avoid-microplastics-in-tea.html" },

  { key:"Tea|Teaware", swap:"Get a stainless or glass infuser", room:"kitchen", stage:"all", needs:"tea", rank:86, est:18,
    why:"The point of loose leaf is lost if you steep it in a nylon mesh basket, which sheds under the same heat.",
    free:"A fine metal sieve held over the cup does the job.",
    article:"articles/how-to-avoid-microplastics-in-tea.html" },

  { key:"Coffee|Brewers", swap:"Move to a plastic free coffee maker", room:"kitchen", stage:"all", needs:"coffee", rank:90, est:60,
    why:"Hot water sitting in a plastic reservoir every morning is an easy daily dose to eliminate. Glass, steel, or ceramic only.",
    free:"A stainless pour over cone over a mug removes the plastic for the price of nothing if you already own one.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  { key:"Coffee|Travel Mugs", swap:"Stop drinking coffee through plastic lids", room:"kitchen", stage:"all", needs:"coffee", rank:89, est:30,
    why:"Plastic lined paper cups shed particles into hot coffee, and the lid sits against the hottest liquid you drink all day.",
    free:"Drink it without the lid, or bring any mug you already own.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  { key:"Coffee|Filters", swap:"Switch to unbleached or metal filters", room:"kitchen", stage:"all", needs:"coffee", rank:80, est:12,
    why:"Plastic pods brew hot water through plastic every morning, and bleached filters add chlorine byproducts to the cup.",
    free:"A reusable metal filter pays for itself, but simply switching from pods to any paper filter is the bigger jump.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  { key:"Coffee|Beans", swap:"Choose beans tested for mold and pesticides", room:"kitchen", stage:"all", needs:"coffee", rank:74, est:25,
    why:"Coffee is one of the most heavily sprayed crops, and most bags are lined with plastic film that sits against the oils.",
    free:"Buy whole beans from a local roaster in a paper bag. Often cheaper than what you buy now.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  { key:"Coffee|Grinders", swap:"Grind in steel, not plastic", room:"kitchen", stage:"all", needs:"coffee", rank:57, est:80,
    why:"Blade grinders with plastic chambers build static and heat, and shed into the grounds you brew.",
    free:"Ask your roaster to grind the bag for you. No purchase at all.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  { key:"Coffee|Espresso Machines", swap:"Choose an espresso machine with a metal water path", room:"kitchen", stage:"all", needs:"coffee", rank:54, est:600,
    why:"Pressurized hot water through plastic tubing, twice a day, for years. The most expensive swap here and the least urgent.",
    free:"A stovetop moka pot makes espresso strength coffee in steel for under $40.",
    article:"articles/how-to-enjoy-coffee-without-plastic.html" },

  /* ---------- PANTRY ---------- */
  { key:"Pantry|Salt", swap:"Rethink your salt", room:"kitchen", stage:"all", needs:null, rank:88, est:15,
    why:"Nearly all salt carries microplastics, and plastic grinders shed thousands of particles per twist directly onto your food.",
    free:"Stop using the plastic grinder. Use flake or coarse salt with your fingers.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Spices", swap:"Move spices to metal tested brands in glass", room:"kitchen", stage:"all", needs:null, rank:66, est:35,
    why:"Spices are a repeat source of lead and cadmium, and organic certification does nothing about heavy metals.",
    free:"Transfer what you own into glass jars and skip the ones you rarely use.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Rice", swap:"Choose lower arsenic rice", room:"kitchen", stage:"all", needs:null, rank:61, est:15,
    why:"Rice concentrates inorganic arsenic more than any other staple, and plastic bags add to it.",
    free:"Rinse rice and cook it in extra water, then drain. Cuts arsenic substantially for free.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Flour", swap:"Buy glyphosate residue free flour", room:"kitchen", stage:"all", needs:null, rank:58, est:20,
    why:"Wheat and oats are commonly desiccated with glyphosate before harvest. Organic alone does not guarantee a clean result, certified testing does.",
    free:"Nothing free here, but buying less processed flour in paper rather than lined bags helps.",
    article:"articles/glyphosate-detox-guide.html" },

  { key:"Pantry|Nuts", swap:"Buy nuts in glass or paper, not plastic", room:"kitchen", stage:"all", needs:null, rank:52, est:22,
    why:"Nuts are high fat, and fat pulls plasticizers out of the packaging they sit in for months.",
    free:"Buy from the bulk bin into your own jar.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Popcorn", swap:"Pop it on the stove", room:"kitchen", stage:"all", needs:null, rank:47, est:12,
    why:"Microwave popcorn bags are lined with PFAS that migrate into the oil at popping temperature.",
    free:"Kernels in a covered pot with oil. Cheaper than the bags and takes four minutes.",
    article:"articles/pfas-in-fast-food-packaging.html" },

  { key:"Pantry|Honey", swap:"Buy honey in glass", room:"kitchen", stage:"all", needs:null, rank:43, est:16,
    why:"Squeeze bottles are plastic against a food you eat straight, and honey has repeatedly tested positive for microplastics.",
    free:"Choose the glass jar next time. Usually the same price.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Sugar", swap:"Move sweeteners out of plastic", room:"kitchen", stage:"all", needs:null, rank:41, est:12,
    why:"A lower priority swap, but sugar and syrups are stored long term and packaging matters over months.",
    free:"Decant into a glass jar you already have.",
    article:"articles/microplastics-in-salt-and-pantry-staples.html" },

  { key:"Pantry|Bread", swap:"Get bread out of the plastic bag", room:"kitchen", stage:"all", needs:null, rank:40, est:10,
    why:"Bread sits in plastic film for days, and most commercial wheat carries glyphosate residue on top of it.",
    free:"Buy from a bakery counter in paper, or store your loaf in a cotton bag.",
    article:"articles/glyphosate-detox-guide.html" },

  { key:"Gum|Gum", swap:"Cut plastic chewing gum", room:"kitchen", stage:"all", needs:null, rank:87, est:14,
    why:"Most gum is a synthetic plastic base that sheds thousands of particles into your saliva per piece, up to about 30,000 a year.",
    free:"Stop chewing gum. This is the only swap on the list where doing nothing is the best option.",
    article:"articles/best-plastic-free-chewing-gum.html" },

  /* ---------- WHOLE HOME AIR ---------- */
  { key:"Air Purifiers|Air Purifiers", swap:"Filter the air you sleep and work in", room:"whole", stage:"all", needs:null, rank:79, est:250,
    why:"Household dust is one of the largest microplastic sources you inhale, and indoor air is consistently worse than outdoor.",
    free:"Open two windows on opposite sides of the home for ten minutes a day. Cross ventilation removes a real share of airborne particles for free.",
    article:"articles/best-air-purifiers-for-microplastics.html" },

  { key:"Vacuums|Vacuums", swap:"Vacuum with a sealed HEPA machine", room:"whole", stage:"all", needs:null, rank:78, est:300,
    why:"An unsealed vacuum blows fine synthetic fibers back into the air you breathe. A sealed HEPA one traps them instead.",
    free:"Damp mop hard floors instead of sweeping. Sweeping lifts dust into the air, mopping captures it.",
    article:"articles/microplastics-in-indoor-air.html" },

  /* ---------- LAUNDRY ---------- */
  { key:"Cleaning and Laundry|Laundry", swap:"Catch microfibers in the wash", room:"laundry", stage:"all", needs:null, rank:81, est:40,
    why:"Every synthetic wash releases hundreds of thousands of microfibers into water and back into your home's dust.",
    free:"Wash synthetics less often, on cold, and with full loads. Fewer washes means fewer fibers.",
    article:"articles/microplastics-in-clothing-and-laundry.html" },

  { key:"Cleaning and Laundry|Cleaning", swap:"Switch to concentrate cleaners", room:"laundry", stage:"all", needs:null, rank:68, est:30,
    why:"Concentrates in reusable bottles cut both the plastic bottle stream and the synthetic fragrance you breathe indoors.",
    free:"White vinegar, baking soda, and castile soap handle most of the house for a few dollars.",
    article:"articles/microplastics-in-indoor-air.html" },

  /* ---------- BEDROOM ---------- */
  { key:"Bedroom|Bedding", swap:"Start with an organic cotton pillowcase", room:"bedroom", stage:"all", needs:null, rank:77, est:45,
    why:"You breathe from your bedding for a third of your life. Cheapest, highest impact bedroom swap there is.",
    free:"Wash new bedding before use and skip dryer sheets entirely. Dryer sheets coat fabric in fragrance you then breathe all night.",
    article:"articles/microplastics-in-bedroom-air.html" },

  { key:"Bedroom|Mattresses", swap:"Replace the mattress when you are ready", room:"bedroom", stage:"all", needs:null, rank:59, est:1400,
    why:"The largest textile you own and you breathe from it nightly. Organic latex skips the synthetic foam, flame retardants, and VOCs.",
    free:"A wool mattress topper over your current mattress puts a natural barrier between you and the foam for a fraction of the cost.",
    article:"articles/microplastics-in-bedroom-air.html" },

  /* ---------- BATHROOM: mouth first, then skin ---------- */
  { key:"Bathroom|Toothbrushes", swap:"Switch your toothbrush", room:"bathroom", stage:"all", needs:null, rank:72, est:15,
    why:"A plastic brush in your mouth twice a day for years. Note that most bamboo brushes still use nylon bristles.",
    free:"Nothing free, but a brush lasts three months and costs a few dollars either way.",
    article:"articles/bamboo-toothbrush-plastic-bristles.html" },

  { key:"Bathroom|Toothcare", swap:"Change your toothpaste", room:"bathroom", stage:"all", needs:null, rank:71, est:14,
    why:"Conventional paste carries SLS, synthetic fragrance, and artificial sweeteners, in a tube that cannot be recycled. You put this in your mouth daily.",
    free:"Baking soda brushing works, though most people will not stick with it. The swap is cheap enough to just make.",
    article:"articles/best-non-toxic-toothpaste-guide.html" },

  { key:"Bathroom|Floss", swap:"Move to silk or PFAS free floss", room:"bathroom", stage:"all", needs:null, rank:70, est:12,
    why:"Most conventional floss is coated in PFAS that you then drag between your teeth and into your gums.",
    free:"None. This one is a few dollars and worth making immediately.",
    article:"articles/pfas-free-dental-floss.html" },

  { key:"Bathroom|Period Care", swap:"Switch your period products", room:"bathroom", stage:"all", needs:"periods", rank:73, est:35,
    why:"Mucosal tissue absorbs far more than skin, and conventional pads are up to 90% plastic while tampons have tested positive for heavy metals.",
    free:"Nothing free, but a cup or organic cotton lasts and costs less per year than what you buy now.",
    article:"articles/best-non-toxic-period-products.html" },

  { key:"Clean Water|Shower Filters", swap:"Filter your shower water", room:"bathroom", stage:"all", needs:null, rank:67, est:45,
    why:"Hot water opens pores and volatilizes chlorine byproducts you then inhale in a closed room for ten minutes.",
    free:"Shorter, cooler showers and running the fan cuts the inhaled share.",
    article:"articles/how-to-filter-pfas-and-microplastics-from-water.html" },

  { key:"Bathroom|Deodorants", swap:"Change your deodorant", room:"bathroom", stage:"all", needs:null, rank:65, est:16,
    why:"Applied to broken skin after shaving, every day, and a common route for synthetic fragrance and phthalates.",
    free:"Plain baking soda or magnesium spray works for many people at almost no cost.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Sunscreen", swap:"Move to a mineral sunscreen", room:"bathroom", stage:"all", needs:null, rank:64, est:28,
    why:"Chemical UV filters are absorbed into blood at levels the FDA itself flagged for further study. Zinc sits on top of skin instead.",
    free:"Shade, a hat, and long sleeves cost nothing and outperform any sunscreen.",
    article:"articles/best-mineral-sunscreen-guide.html" },

  { key:"Bathroom|Shampoo", swap:"Change your shampoo and conditioner", room:"bathroom", stage:"all", needs:null, rank:63, est:35,
    why:"Large surface area, hot water, open pores, several times a week. Fragrance is the main issue and it is legally allowed to hide its ingredients.",
    free:"Wash your hair less often. Most people over wash and it is the single cheapest reduction available.",
    article:"articles/microplastics-in-cosmetics-and-personal-care.html" },

  { key:"Bathroom|Body Wash", swap:"Change your body wash", room:"bathroom", stage:"all", needs:null, rank:62, est:22,
    why:"Same story as shampoo across the largest organ you have, and many body washes still contain plastic microbeads.",
    free:"A plain bar soap in paper is cheaper than what you use now and removes the plastic bottle too.",
    article:"articles/microplastics-in-cosmetics-and-personal-care.html" },

  { key:"Bathroom|Shower Curtains", swap:"Get the PVC curtain out", room:"bathroom", stage:"all", needs:null, rank:60, est:40,
    why:"That new shower curtain smell is PVC offgassing phthalates into a small, hot, closed room you stand in daily.",
    free:"Take the liner outside to offgas for a week, and run the fan every shower.",
    article:"articles/best-non-toxic-shower-curtains.html" },

  { key:"Bathroom|Body Care", swap:"Simplify your body care", room:"bathroom", stage:"all", needs:null, rank:56, est:38,
    why:"Body lotion goes on the largest surface area of skin you have, and stays there all day.",
    free:"Plain jojoba or coconut oil replaces most body lotion for less money.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Moisturizers", swap:"Change your facial moisturizer", room:"bathroom", stage:"all", needs:null, rank:55, est:45,
    why:"Left on the face for hours, near the eyes and mouth, twice a day.",
    free:"Cut the number of products first. Fewer products means less total exposure regardless of brand.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Face Cleansers", swap:"Change your face cleanser", room:"bathroom", stage:"all", needs:null, rank:53, est:32,
    why:"Rinse off, so lower priority than anything you leave on, but many still contain plastic microbeads and synthetic fragrance.",
    free:"Cleanse once a day instead of twice unless you wear makeup.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Skincare", swap:"Audit your serums and treatments", room:"bathroom", stage:"all", needs:null, rank:51, est:60,
    why:"Leave on products applied to deliberately permeable skin. Worth doing after the basics, not before.",
    free:"Stop layering. Three products beat seven, and it costs nothing to use less.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Lip Care", swap:"Change your lip balm", room:"bathroom", stage:"all", needs:null, rank:54, est:12,
    why:"Straightforward ingestion. You eat a meaningful amount of whatever you put on your lips.",
    free:"Plain beeswax or shea. Cheap and it is what the good ones are anyway.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Bathroom|Razors", swap:"Switch to a metal safety razor", room:"bathroom", stage:"all", needs:"shave", rank:50, est:35,
    why:"Ends the stream of plastic disposables and gives a better shave. One handle lasts decades and blades cost cents.",
    free:"None, but this swap pays for itself within a year.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Bath Accessories", swap:"Replace plastic bath accessories", room:"bathroom", stage:"all", needs:null, rank:46, est:25,
    why:"Nylon loofahs shed synthetic fibers onto wet skin and harbor bacteria in the process.",
    free:"Use a plain washcloth you already own.",
    article:"articles/personal-care-101.html" },

  { key:"Bathroom|Nail Polish", swap:"Change your nail polish", room:"bathroom", stage:"all", needs:"makeup", rank:39, est:24,
    why:"The classic toxic trio, plus you inhale the solvents at close range while it dries.",
    free:"Skip polish, or at minimum paint near an open window.",
    article:"articles/microplastics-in-cosmetics-and-personal-care.html" },

  /* ---------- MAKEUP: ingestion first ---------- */
  { key:"Makeup|Lips", swap:"Replace lipstick and lip products", room:"bathroom", stage:"all", needs:"makeup", rank:52, est:35,
    why:"The one makeup category you genuinely eat, and lipsticks have repeatedly tested positive for lead.",
    free:"Wear it less often. Frequency matters more than brand for a product you ingest.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Foundation", swap:"Replace your foundation", room:"bathroom", stage:"all", needs:"makeup", rank:49, est:45,
    why:"Full face coverage, worn all day, often containing silicones and PFAS for that long wear finish.",
    free:"Wear it fewer days a week. Nothing else on this list is that easy.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Mascara", swap:"Replace your mascara", room:"bathroom", stage:"all", needs:"makeup", rank:44, est:28,
    why:"Applied at the eye margin where absorption is high, and waterproof formulas are a common PFAS source.",
    free:"Drop waterproof formulas. They are the worst offenders and the hardest to remove.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Eyeliner", swap:"Replace your eyeliner", room:"bathroom", stage:"all", needs:"makeup", rank:42, est:24,
    why:"Applied to the lash line and waterline, some of the most permeable tissue on the body.",
    free:"Skip the waterline. That single habit change removes most of the exposure.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Blush & Bronzer", swap:"Replace blush and bronzer", room:"bathroom", stage:"all", needs:"makeup", rank:38, est:32,
    why:"Powders are inhaled during application, and talc based ones carry an asbestos contamination question.",
    free:"Apply with a brush rather than tapping powder loose, and do it away from your face first.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Concealer", swap:"Replace your concealer", room:"bathroom", stage:"all", needs:"makeup", rank:37, est:24,
    why:"Small surface area, so genuinely lower priority. Worth doing when you run out, not before.",
    free:"Use it only where you need it rather than as a second foundation.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  { key:"Makeup|Eyeshadow", swap:"Replace your eyeshadow", room:"bathroom", stage:"all", needs:"makeup", rank:36, est:28,
    why:"Lowest priority makeup swap. Small area, no ingestion, infrequent for most people.",
    free:"Replace it when the current one runs out.",
    article:"articles/best-non-toxic-makeup-brands.html" },

  /* ---------- KIDS: gated by stage ---------- */
  { key:"Kids|Bottles & Sippy Cups", swap:"Move bottles and cups to glass or steel", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:100, est:45,
    why:"Heated formula in a plastic bottle is one of the highest microplastic doses measured anywhere, up to 16 million particles per liter.",
    free:"Never heat formula in the bottle. Mix in glass, cool it, then transfer. That removes most of it today.",
    article:"articles/best-non-toxic-baby-bottles.html" },

  { key:"Kids|Formula", swap:"Choose a cleaner formula", room:"nursery", stage:"expecting,baby", needs:null, rank:98, est:180,
    why:"The entire diet for months, and formula has tested for heavy metals and seed oil contaminants.",
    free:"None, but preparing with filtered water is the cheapest improvement you can make.",
    article:"articles/microplastics-in-baby-food.html" },

  { key:"Kids|Baby Food", swap:"Change how you buy baby food", room:"nursery", stage:"baby,toddler", needs:null, rank:95, est:60,
    why:"Pouches are plastic against warm puree, and commercial baby food has repeatedly tested high for heavy metals.",
    free:"Mash whatever you are eating. Free, and better food than any jar.",
    article:"articles/microplastics-in-baby-food.html" },

  { key:"Kids|Teethers", swap:"Replace plastic teethers", room:"nursery", stage:"baby,toddler", needs:null, rank:94, est:25,
    why:"An object designed to be chewed on for hours, by someone who cannot tell you it tastes wrong.",
    free:"A clean, chilled cotton washcloth is the classic teether and costs nothing.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Mealtime", swap:"Replace plates, bowls, and utensils", room:"nursery", stage:"baby,toddler,kid", needs:null, rank:92, est:40,
    why:"Hot food on plastic plates, every meal, for years. Melamine kids dishes leach more the hotter the food.",
    free:"Use your normal small plates and let them learn on ceramic. Breakage is cheaper than replacement gear.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Diapers", swap:"Change your diaper brand", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:91, est:80,
    why:"Against the most permeable skin on the body, 24 hours a day, for roughly three years. Several major brands have tested positive for PFAS.",
    free:"Change more frequently. Contact time is the variable you control for free.",
    article:"articles/best-non-toxic-diapers.html" },

  { key:"Kids|Wipes", swap:"Change your wipes", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:90, est:35,
    why:"Most wipes are polyester fabric soaked in preservative solution, used dozens of times a day on broken skin.",
    free:"Cotton washcloths and warm water. Cheaper over three years than any wipe.",
    article:"articles/best-non-toxic-baby-wipes.html" },

  { key:"Kids|Diaper Care", swap:"Change your diaper cream", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:88, est:22,
    why:"Applied thickly to already irritated skin, which absorbs far more than intact skin does.",
    free:"Plain zinc oxide or lanolin. The simplest formulas are usually the cheapest ones.",
    article:"articles/best-non-toxic-diaper-rash-creams.html" },

  { key:"Kids|Baby Wash", swap:"Change baby wash and shampoo", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:85, est:20,
    why:"Thinner skin, higher surface area relative to body weight, and a developing system. Fragrance is the main issue.",
    free:"Bathe with water only for the first months. Recommended anyway, and free.",
    article:"articles/baby-kids-101.html" },

  { key:"Kids|Nursery", swap:"Set up the nursery without offgassing", room:"nursery", stage:"expecting,baby", needs:null, rank:84, est:200,
    why:"New furniture, foam, and paint offgas hardest in the first months, straight into a small room where an infant sleeps 16 hours a day.",
    free:"Assemble and air out everything for two to four weeks before the baby uses the room. Free and genuinely effective.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Play Mats", swap:"Replace foam play mats", room:"nursery", stage:"baby,toddler", needs:null, rank:83, est:110,
    why:"EVA foam mats offgas into the exact 30cm of air where a crawling baby breathes, all day.",
    free:"A cotton quilt or wool rug on the floor does the same job.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Baby Food Making", swap:"Make and store baby food in glass", room:"nursery", stage:"baby,toddler", needs:null, rank:82, est:45,
    why:"Steaming and blending in a plastic chamber puts heat, fat, and plastic together at once.",
    free:"A fork and a pot. Purees do not need equipment.",
    article:"articles/microplastics-in-baby-food.html" },

  { key:"Kids|Bibs", swap:"Replace plastic and silicone bibs", room:"nursery", stage:"baby,toddler", needs:null, rank:76, est:18,
    why:"PVC bibs sit against the neck and chest through every meal, and end up in the mouth constantly.",
    free:"An old cotton towel tucked into the collar.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Bath", swap:"Replace bath toys and tub gear", room:"nursery", stage:"baby,toddler", needs:null, rank:75, est:30,
    why:"Squeeze toys hold warm water and grow mold inside, and most are PVC that a child puts in their mouth.",
    free:"Throw out the squeeze toys. Cups and a ladle are better bath toys anyway.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Cloth Diapers", swap:"Consider cloth for part of the day", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:74, est:150,
    why:"Removes the disposable question entirely for the hours you use it, and pays back over three years.",
    free:"Even part time cloth, at home only, cuts disposable contact substantially.",
    article:"articles/best-non-toxic-diapers.html" },

  { key:"Kids|Toys", swap:"Shift toys to wood and natural fiber", room:"nursery", stage:"baby,toddler,kid", needs:null, rank:73, est:70,
    why:"Anything a small child holds ends up in the mouth, and soft plastic toys are a phthalate source.",
    free:"Stop buying new plastic toys. Attrition handles the rest without a single purchase.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Clothing", swap:"Move kids clothing to natural fiber", room:"nursery", stage:"expecting,baby,toddler,kid", needs:null, rank:71, est:80,
    why:"Polyester against skin all day, and flame retardant treatments are still common in children's sleepwear.",
    free:"Wash everything new before first wear, and buy secondhand cotton. Used natural fiber beats new synthetic.",
    article:"articles/closet-101.html" },

  { key:"Kids|High Chairs", swap:"Choose a wood or steel high chair", room:"nursery", stage:"baby,toddler", needs:null, rank:69, est:220,
    why:"A plastic tray holding hot food, every meal, for two years.",
    free:"Put a plate on the tray instead of food directly on it.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Nursing Pillows", swap:"Choose an organic nursing pillow", room:"nursery", stage:"expecting,baby", needs:null, rank:68, est:70,
    why:"Polyurethane foam pressed against both of you for hours a day during the newborn months.",
    free:"Stacked pillows you already own work, and many people prefer them.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Pumping", swap:"Pump into glass", room:"nursery", stage:"expecting,baby", needs:null, rank:67, est:45,
    why:"Warm milk into plastic flanges and bottles, several times a day. Milk is high fat, which pulls more out of plastic.",
    free:"Transfer to glass immediately after pumping instead of storing in the plastic bottle.",
    article:"articles/best-non-toxic-baby-bottles.html" },

  { key:"Kids|Carriers", swap:"Choose a natural fiber carrier", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:63, est:120,
    why:"Hours of direct contact against a newborn's face and hands, usually in synthetic mesh.",
    free:"A woven cotton wrap is the cheapest carrier and the most natural.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Car Seats", swap:"Choose a flame retardant free car seat", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:57, est:350,
    why:"Enclosed, heated by sun, and federally required to meet flammability standards that many brands still meet chemically.",
    free:"Air out a new seat outside for two weeks, and crack the windows on hot days before the child gets in.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  { key:"Kids|Strollers", swap:"Choose a cleaner stroller fabric", room:"nursery", stage:"expecting,baby,toddler", needs:null, rank:45, est:600,
    why:"Lowest priority kids purchase here. Real exposure, but far less contact time than anything above it.",
    free:"Air out a new stroller before use and skip the water repellent treatments.",
    article:"articles/non-toxic-baby-toddler-products-guide.html" },

  /* ---------- SUPPLEMENTS: gated by trigger, prenatal by stage ---------- */
  { key:"Supplements|Prenatal", swap:"Choose a tested prenatal", room:"any", stage:"expecting", needs:null, rank:97, est:55,
    why:"Taken daily through the most sensitive developmental window there is, and heavy metal contamination in prenatals is common.",
    free:"None. If you take one thing from this plan, make it this.",
    article:"articles/cleanest-prenatal-vitamins.html" },

  { key:"Supplements|Protein", swap:"Switch to a metal tested protein powder", room:"any", stage:"all", needs:"supplements", rank:59, est:60,
    why:"Consumed daily in large scoops, and independent testing repeatedly finds lead and cadmium in plant proteins especially.",
    free:"Eat the protein instead. Whole food has no contamination testing problem.",
    article:"articles/cleanest-protein-powder-tested.html" },

  { key:"Supplements|Electrolytes", swap:"Switch your electrolyte brand", room:"any", stage:"all", needs:"supplements", rank:56, est:40,
    why:"Independent testing found PFAS in 23% of electrolyte products, and the clean label brands scored worst.",
    free:"Pinch of quality salt in water with a squeeze of citrus. That is what most of it is.",
    article:"articles/best-non-toxic-electrolytes.html" },

  { key:"Supplements|Omega 3", swap:"Choose a tested omega 3", room:"any", stage:"all", needs:"supplements", rank:51, est:38,
    why:"Fish oil concentrates whatever the fish carried, and rancidity is as common a problem as contamination.",
    free:"Eat small oily fish. Sardines cost less than any capsule.",
    article:"articles/personal-care-101.html" },

  { key:"Supplements|Creatine", swap:"Choose a tested creatine", room:"any", stage:"all", needs:"supplements", rank:48, est:32,
    why:"Taken daily and usually unflavored, so purity certification is the only thing separating brands.",
    free:"None, but the tested brands are rarely the expensive ones.",
    article:"articles/cleanest-protein-powder-tested.html" },

  { key:"Supplements|Magnesium", swap:"Choose a tested magnesium", room:"any", stage:"all", needs:"supplements", rank:47, est:26,
    why:"Mineral supplements are the most likely category to carry heavy metals, because they are minerals.",
    free:"Epsom salt baths and leafy greens.",
    article:"articles/personal-care-101.html" },

  { key:"Supplements|Vitamin D", swap:"Choose a tested vitamin D", room:"any", stage:"all", needs:"supplements", rank:46, est:22,
    why:"Usually suspended in an oil that can go rancid, and softgel capsules are a common phthalate source.",
    free:"Fifteen minutes of midday sun on bare arms.",
    article:"articles/personal-care-101.html" },

  /* ---------- LIFESTYLE ---------- */
  { key:"Fitness|Yoga Mats", swap:"Replace your yoga mat", room:"any", stage:"all", needs:"yoga", rank:58, est:90,
    why:"Your face is inches from it while you breathe deeply on purpose, and PVC mats offgas hardest when warm.",
    free:"Practice on a cotton rug or towel over a hard floor.",
    article:"articles/best-non-toxic-yoga-mats.html" },

  { key:"Pets|Pets", swap:"Replace plastic pet bowls and toys", room:"any", stage:"all", needs:"pets", rank:44, est:28,
    why:"Plastic bowls scratch and harbor bacteria, and pets chew their toys far harder than any child does.",
    free:"Any ceramic bowl from your own cupboard works as a pet bowl.",
    article:"articles/microplastics-in-indoor-air.html" }

];

/* ---------------------------------------------------------------------------
   TRIGGERS: extra quiz questions that unlock or remove whole sections.
   Each one, answered no, removes every rule that needs it.
   --------------------------------------------------------------------------- */
window.PLAN_TRIGGERS = [
  { id:"cook",        label:"Cook at home most days",        hint:"Unlocks cookware, boards, and utensils" },
  { id:"coffee",      label:"Drink coffee",                  hint:"Brewers, mugs, filters, beans" },
  { id:"tea",         label:"Drink tea",                     hint:"Tea bags are a top five exposure" },
  { id:"makeup",      label:"Wear makeup",                   hint:"Lips first, since you ingest it" },
  { id:"periods",     label:"Use period products",           hint:"Higher absorption than skin" },
  { id:"shave",       label:"Shave regularly",               hint:"Razors and post shave products" },
  { id:"supplements", label:"Take supplements",              hint:"Powders and capsules are a metals source" },
  { id:"yoga",        label:"Do yoga or floor workouts",     hint:"Mats offgas at close breathing range" }
];

/* Room ids used by rules, mapped to the labels the quiz shows. */
window.PLAN_ROOMS = [
  { id:"kitchen",  label:"Kitchen" },
  { id:"bathroom", label:"Bathroom" },
  { id:"bedroom",  label:"Bedroom" },
  { id:"laundry",  label:"Laundry" },
  { id:"nursery",  label:"Nursery / Kids" },
  { id:"whole",    label:"Whole home air" }
];

window.PLAN_STAGES = [
  { id:"expecting", label:"Expecting" },
  { id:"baby",      label:"0 to 12 months" },
  { id:"toddler",   label:"1 to 3 years" },
  { id:"kid",       label:"4 years and up" }
];

/* Budget modes. minRank sets the cutoff, maxSwaps caps the list,
   tierCap limits how expensive a recommended product may be. */
window.PLAN_BUDGETS = [
  { id:"essentials", label:"Start with essentials", blurb:"The highest exposure swaps only, cheapest option that still passes.",
    minRank:70, maxSwaps:12, tierCap:2 },
  { id:"moderate",   label:"Moderate",              blurb:"A full plan at a sane pace, best value pick in each category.",
    minRank:52, maxSwaps:24, tierCap:3 },
  { id:"thorough",   label:"Replace most things",   blurb:"Everything that applies to your home, best in class where it matters.",
    minRank:0,  maxSwaps:99, tierCap:4 }
];

/* Primary concern boosts a whole area up the ranking. */
window.PLAN_CONCERNS = [
  { id:"kitchen",  label:"Food and kitchen",     boost:{ kitchen:12 } },
  { id:"babyfood", label:"Baby feeding and food",boost:{ nursery:12 } },
  { id:"water",    label:"Drinking water",       boost:{ kitchen:6 }, keys:["Clean Water|Water Filters","Clean Water|Water Bottles","Clean Water|Kettles","Clean Water|Shower Filters"], keyBoost:16 },
  { id:"personal", label:"Personal care",        boost:{ bathroom:14 } },
  { id:"air",      label:"Air and bedroom",      boost:{ bedroom:14, whole:14 } },
  { id:"none",     label:"Not sure yet",         boost:{} }
];
