// All products for the Low Tox Baby Registry, organized to match the doc.
// img: known Amazon image ID. asin: known ASIN. url: explicit URL (overrides asin).
// Empty img means we need to scrape it.

const REGISTRY = [
  {
    id: "sleep",
    name: "Sleep & nursery",
    tier: "Tier 1 — highest priority",
    blurb: "Crib, mattress, sheets and sleep sack chosen for what babies breathe in for ten plus hours a day. Off gassing is highest in the first six months.",
    products: [
      { name: "Babyletto Hudson Crib", searchQ: "Babyletto+Hudson+crib", img: "71GoLdoPR6L", sentence: "Solid New Zealand pine with a non toxic water based finish. Converts to a toddler bed and daybed.", badges: ["GREENGUARD Gold", "Solid wood"], tag: "Editor pick" },
      { name: "DaVinci Kalani 4 in 1 Crib", searchQ: "DaVinci+Kalani+4+in+1+convertible+crib", img: "", sentence: "Solid wood with low VOC finishes. Avoid MDF and particleboard cribs where off gassing is heaviest in the first six months.", badges: ["Solid wood", "GREENGUARD Gold"], tag: null },
      { name: "Oeuf Sparrow Crib", searchQ: "Oeuf+Sparrow+crib", img: "", sentence: "Eco friendly birch crib made in Latvia with non toxic finishes. Avoid glossy lacquers and particleboard.", badges: ["Solid birch", "Low VOC"], tag: null },
      { name: "Naturepedic Organic Classic Crib Mattress", searchQ: "Naturepedic+Organic+Classic+crib+mattress", img: "71ipiUT2ebL", sentence: "Organic cotton and wool with food grade PE waterproofing. No polyurethane foam, no fiberglass, no flame retardants.", badges: ["GOTS", "MADE SAFE"], tag: "Editor pick" },
      { name: "Avocado Eco Organic Crib Mattress", searchQ: "Avocado+Eco+Organic+crib+mattress", img: "", sentence: "GOTS certified organic cotton with natural latex core. No polyurethane foam, no chemical flame retardants.", badges: ["GOLS latex", "GOTS"], tag: null },
      { name: "My Green Mattress Emily Crib Mattress", searchQ: "My+Green+Mattress+Emily+crib", img: "", sentence: "GOTS organic cotton, natural wool fire barrier, pocketed coil core. The most affordable triple certified pick.", badges: ["GOTS", "GREENGUARD Gold"], tag: "Best value" },
      { name: "Naturepedic Organic Cotton Waterproof Mattress Pad", searchQ: "Naturepedic+organic+cotton+waterproof+pad+crib", img: "", sentence: "Organic cotton with food grade polyethylene backing. The cleanest waterproof option, no PVC, no PFAS treatments.", badges: ["No PVC", "No PFAS"], tag: null },
      { name: "MakeMake Organics Crib Sheets", searchQ: "MakeMake+Organics+crib+sheet", img: "", sentence: "GOTS certified organic cotton with no formaldehyde wrinkle resistant treatments. Soft, durable, fade resistant.", badges: ["GOTS organic"], tag: null },
      { name: "Burt's Bees Baby Organic Crib Sheets", searchQ: "Burts+Bees+Baby+organic+crib+sheets", img: "61r3F05PnpL", sentence: "GOTS certified 100% organic cotton jersey knit. Widely available, affordable, gets softer with each wash.", badges: ["GOTS organic"], tag: "Best value" },
      { name: "Coyuchi Organic Crib Sheets", searchQ: "Coyuchi+organic+crib+sheet", img: "", sentence: "GOTS organic cotton percale with deep pockets. Higher end weave that wears in beautifully.", badges: ["GOTS organic"], tag: null },
      { name: "Woolino 4 Season Merino Sleep Sack", searchQ: "Woolino+4+Season+Merino+sleep+sack+baby", img: "", sentence: "Merino wool is naturally flame resistant without chemicals. Self regulating warmth across seasons.", badges: ["Merino wool"], tag: "Editor pick" },
      { name: "Kyte Baby Bamboo Sleep Sack", searchQ: "Kyte+Baby+bamboo+sleep+sack", img: "", sentence: "Bamboo viscose is a chemical process but very soft and breathable. Avoid polyester fleece sleep sacks.", badges: ["Bamboo viscose"], tag: null },
      { name: "Burt's Bees Organic Cotton Sleep Sack", searchQ: "Burts+Bees+organic+cotton+sleep+sack", img: "", sentence: "GOTS organic cotton sleep sack at an accessible price point. The cleanest non wool pick.", badges: ["GOTS organic"], tag: null },
      { name: "Aden + Anais Organic Muslin Swaddles", searchQ: "Aden+Anais+organic+muslin+swaddle", img: "", sentence: "100% organic cotton muslin. Skip bamboo rayon swaddles marketed as natural, the process is chemical intensive viscose.", badges: ["GOTS organic"], tag: null },
      { name: "Little Unicorn Cotton Muslin Swaddles", searchQ: "Little+Unicorn+GOTS+swaddle", img: "91flvWzsU5L", sentence: "GOTS certified organic cotton muslin with beautiful prints. Multi use as swaddle, nursing cover, or stroller blanket.", badges: ["GOTS organic"], tag: "Best value" }
    ]
  },
  {
    id: "air",
    name: "Nursery air",
    tier: "Tier 1 — highest priority",
    blurb: "True HEPA and activated carbon filtration for the room baby breathes in for thousands of hours.",
    products: [
      { name: "Coway Airmega 200M", searchQ: "Coway+Airmega+200M+air+purifier", img: "", sentence: "True HEPA plus activated carbon for VOCs. Reliable, quiet, runs continuously. Avoid ionizers and ozone units.", badges: ["True HEPA", "Activated carbon"], tag: "Editor pick" },
      { name: "Austin Air it", searchQ: "Austin+Air+it+air+purifier", img: "", sentence: "Steel housing instead of plastic, HEPA plus activated carbon, purely mechanical. Filters fine particles and volatile organic compounds.", badges: ["True HEPA", "Smart"], tag: null },
      { name: "Canopy Filtered Humidifier", searchQ: "Canopy+humidifier+filtered", img: "", sentence: "Filtered evaporative humidifier so it does not aerosolize minerals or microbes. Bonus: weekly mold prevention design.", badges: ["Evaporative", "Filtered"], tag: null },
      { name: "Vornado Evaporative Humidifier", searchQ: "Vornado+evaporative+humidifier", img: "", sentence: "Evaporative rather than ultrasonic, so it does not aerosolize minerals. With any ultrasonic model use distilled water only, because tap water aerosolizes minerals straight into baby's lungs.", badges: ["Ultrasonic"], tag: null },
      { name: "Airthings View Plus", searchQ: "Airthings+View+Plus+air+quality+monitor", img: "", sentence: "Tracks CO2, VOCs, PM2.5, radon and humidity. Useful baseline for the first six months in any new nursery.", badges: ["VOC, PM2.5, radon"], tag: null },
      { name: "Awair Element", searchQ: "Awair+Element+air+quality+monitor", img: "", sentence: "Tracks VOCs, CO2, PM2.5, temperature and humidity. Smaller and cheaper than Airthings, no radon.", badges: ["VOC monitor"], tag: null }
    ]
  },
  {
    id: "bottles",
    name: "Bottles & nursing",
    tier: "Tier 1 — highest priority",
    blurb: "Bottles, nipples, brushes and nursing supplies that skip plastic where it touches breast milk and warm formula.",
    products: [
      { name: "Dr. Brown's Glass Options+ Bottles", searchQ: "Dr+Brown+glass+Options+anti+colic+bottle", img: "", sentence: "Borosilicate glass with the venting system that reduces gas. The most pediatrician recommended glass bottle.", badges: ["Borosilicate glass"], tag: "Editor pick" },
      { name: "Lifefactory Glass Bottle with Silicone Sleeve (9oz)", asin: "B01M5GHAZO", img: "31uhPCgmypL", sentence: "Medical grade borosilicate glass wrapped in food grade silicone for grip and shock absorption. Zero microplastic release at any temperature.", badges: ["Borosilicate", "BPA free"], tag: null },
      { name: "Pura Kiki Stainless Steel Bottle", searchQ: "Pura+Kiki+stainless+steel+infant+bottle", img: "41LzOE7SfTL", sentence: "Medical grade stainless interior with silicone nipple. The unbreakable alternative to glass, grows from bottle to sport top.", badges: ["100% plastic free"], tag: null },
      { name: "Klean Kanteen Baby Bottle", searchQ: "Klean+Kanteen+baby+bottle", img: "", sentence: "18/8 stainless steel body with medical grade silicone nipple. Lightweight and built to last for years.", badges: ["18/8 stainless"], tag: null },
      { name: "Comotomo Replacement Silicone Nipples", searchQ: "Comotomo+replacement+nipple+silicone", img: "", sentence: "100% medical grade silicone, no fillers. Replace every two to three months as silicone slowly breaks down.", badges: ["Medical silicone"], tag: null },
      { name: "Dr. Brown's Silicone Nipples", searchQ: "Dr+Brown+silicone+nipple+replacement", img: "", sentence: "Pure silicone replacement nipples. Avoid latex nipples, they degrade faster and can trigger latex sensitivity.", badges: ["Silicone, no latex"], tag: null },
      { name: "Boon Cacti Silicone Bottle Brush", searchQ: "Boon+Cacti+silicone+bottle+brush", img: "", sentence: "Silicone bristles do not trap mold the way nylon does, and they never shed microplastics into the bottle.", badges: ["Silicone bristles"], tag: "Best value" },
      { name: "OXO Tot Silicone Bottle Brush", searchQ: "OXO+Tot+silicone+bottle+brush", img: "", sentence: "Soft silicone bristles with a non slip handle. Easy to disassemble and air dry between uses.", badges: ["Silicone bristles"], tag: null },
      { name: "REDECKER Bottle Brush", asin: "B002HORIN4", img: "71rFLyBorRL", sentence: "Natural horsehair bristles with a beechwood handle. Plastic free option, gentle on glass bottles.", badges: ["Plastic free"], tag: null },
      { name: "Earth Mama Organic Nipple Butter", searchQ: "Earth+Mama+organic+nipple+butter", img: "", sentence: "Lanolin free organic herbs in olive oil and beeswax. Safe for baby, no need to wipe off before nursing.", badges: ["Lanolin free", "Organic"], tag: null },
      { name: "Motherlove Nipple Cream", searchQ: "Motherlove+nipple+cream", img: "", sentence: "Organic herbs in extra virgin olive oil. Lanolin free since lanolin can be pesticide contaminated.", badges: ["Organic", "Lanolin free"], tag: null },
      { name: "Bamboobies Organic Cotton Nursing Pads", searchQ: "Bamboobies+organic+cotton+nursing+pad+washable", img: "", sentence: "Reusable organic cotton pads that absorb without bleached cellulose disposables. Verify GOTS organic, skip bamboo marketing.", badges: ["GOTS organic"], tag: null },
      { name: "Boppy Nursing Pillow with Organic Cotton Cover", searchQ: "Boppy+nursing+pillow+organic+cotton+cover", img: "", sentence: "The cover is the contact point, get organic cotton. Polyester fill is fine since it never touches skin.", badges: ["Organic cotton cover"], tag: null }
    ]
  },
  {
    id: "pumping",
    name: "Pumping & milk storage",
    tier: "Tier 1 — highest priority",
    blurb: "Closed system pumps and reusable storage that keep plastic away from breast milk.",
    products: [
      { name: "Spectra S1 Hospital Strength Breast Pump", searchQ: "Spectra+S1+breast+pump", img: "", sentence: "Closed system prevents milk backup into tubing. Hospital grade motor with rechargeable battery. Glass collection bottles available separately.", badges: ["Closed system"], tag: "Editor pick" },
      { name: "Spectra S2 Plus Breast Pump", searchQ: "Spectra+S2+breast+pump", img: "", sentence: "The plug in version of the S1, same closed system motor. Choose this if you pump in one place.", badges: ["Closed system"], tag: null },
      { name: "COMI Glass Breast Milk Collection Bottles", asin: "B0CCJ65JP5", img: "61XTMdmmpgL", sentence: "Glass collection bottles for Spectra pumps. Pump directly into glass, eliminating plastic at the source.", badges: ["Glass"], tag: null },
      { name: "Junobie Reusable Silicone Milk Storage Bags", searchQ: "Junobie+reusable+silicone+breast+milk+storage", img: "", sentence: "Reusable food grade silicone replaces single use polyethylene bags. Stackable and freezer safe.", badges: ["Reusable silicone"], tag: null },
      { name: "Mila's Keeper Silicone Storage Containers", searchQ: "Mila%27s+Keeper+breast+milk+storage", img: "71AvTcD+roL", sentence: "Food grade silicone designed for breast milk portions. Stackable, freezer safe, eliminates daily bag waste.", badges: ["Food grade silicone"], tag: null },
      { name: "Lansinoh Breast Milk Storage Bags", searchQ: "Lansinoh+breast+milk+storage+bags", img: "", sentence: "If you need disposables, Lansinoh is the most tested polyethylene option. BPA and BPS free.", badges: ["BPA free"], tag: "Disposable backup" }
    ]
  },
  {
    id: "solids",
    name: "Solids & feeding prep",
    tier: "Tier 1 — highest priority",
    blurb: "Plates, utensils, cups and prep gear in materials that can take heat, suction, and a thousand dishwasher cycles.",
    products: [
      { name: "Avanchy Bamboo + Silicone Suction Plate", searchQ: "Avanchy+bamboo+silicone+suction+plate", img: "", sentence: "Bamboo with food grade silicone suction base. Avoid melamine and bamboo composite, they often hide melamine resin binders.", badges: ["Bamboo + silicone"], tag: "Editor pick" },
      { name: "ezpz Mini Mat Silicone Plate", asin: "B01C95ZCNI", img: "41odQEPAoHL", sentence: "Single piece food grade silicone with no fillers. Suctions to high chairs, one piece means no food traps.", badges: ["Food grade silicone"], tag: null },
      { name: "Ahimsa Stainless Steel Bowl and Plate Set", asin: "B0C6SVTQ3Q", img: "71sYJMAjx6L", sentence: "100% stainless steel plates and bowls with no coatings. Designed by a pediatrician, virtually indestructible.", badges: ["Plastic free"], tag: null },
      { name: "Avanchy Stainless + Silicone Utensils", asin: "B07K1FFK6Z", img: "61yfZfNeNzL", sentence: "18/8 stainless on the food contact end, silicone only on the handle. No degradation from biting or heat.", badges: ["18/8 stainless"], tag: "Best value" },
      { name: "NumNum GOOtensils Silicone Spoons", searchQ: "NumNum+GOOtensils+silicone+spoon", img: "", sentence: "100% silicone first stage spoons with a flat scoop perfect for self feeding. No nylon, no bioplastic.", badges: ["Food grade silicone"], tag: null },
      { name: "ezpz Tiny Cup Silicone Open Cup", searchQ: "ezpz+Tiny+Cup+silicone+open+cup", img: "", sentence: "100% silicone open cup sized for first sips. Skip plastic 360 cups, stainless or silicone is the cleaner standard.", badges: ["Food grade silicone"], tag: null },
      { name: "Avanchy Mini Baby Stainless Cup", searchQ: "Avanchy+mini+baby+stainless+cup", img: "", sentence: "Tiny stainless steel open cup, weighted base, perfect for early baby led weaning sips.", badges: ["Stainless steel"], tag: null },
      { name: "Elk and Friends Glass + Silicone Straw Cup", searchQ: "Elk+and+Friends+stainless+steel+sippy+cup+silicone+straw", img: "71fHUyZqu7L", sentence: "Glass or stainless body with silicone straw. Avoid Tritan plastic, even BPA free plastic still leaches.", badges: ["Glass + silicone"], tag: null },
      { name: "Klean Kanteen Kid Kanteen with Silicone Straw", searchQ: "Klean+Kanteen+Kid+stainless+steel+sippy", img: "71sTanwzqIL", sentence: "12 oz stainless steel with leak proof straw cap. Built to survive being thrown from a high chair daily.", badges: ["18/8 stainless"], tag: null },
      { name: "Bumkins Silicone Bib", searchQ: "Bumkins+silicone+bib", img: "51rIsUjyr1L", sentence: "Food grade silicone with a wide catch pocket and adjustable neck. Dishwasher safe, no fabric mold risk.", badges: ["BPA, PVC, phthalate free"], tag: "Best value" },
      { name: "Mushie Silicone Bib", searchQ: "Mushie+silicone+bib", img: "61YYhjXMnyL", sentence: "Food grade silicone with deep catch pocket. Rolls up for travel, beautiful muted colors.", badges: ["No PVC, BPA, phthalates"], tag: null },
      { name: "Stokke Tripp Trapp High Chair", searchQ: "Stokke+Tripp+Trapp+high+chair", img: "61GaFCO7UML", sentence: "Solid European beech with water based finish. Adjusts from 6 months through adulthood, no foam, no plastic tray.", badges: ["GREENGUARD Gold", "Solid beech"], tag: "Lifetime piece" },
      { name: "IKEA Antilop High Chair", searchQ: "IKEA+Antilop+high+chair", img: "", sentence: "Honest pick at thirty dollars. Polypropylene tray but easy to replace and inexpensive. Avoid heavily padded plastic chairs.", badges: ["PP, BPA free"], tag: null },
      { name: "Weck Glass Storage Jars", searchQ: "Weck+glass+jars+storage", img: "", sentence: "Glass jars with glass lids and rubber gaskets for fridge storage. Avoid all plastic baby food storage including BPA free pouches.", badges: ["100% glass"], tag: "Editor pick" },
      { name: "Pyrex Glass Storage with Glass Lids", searchQ: "Pyrex+glass+storage+glass+lids", img: "", sentence: "Borosilicate glass containers with glass lids. Skip the plastic lid versions for fridge baby food.", badges: ["Borosilicate glass"], tag: null },
      { name: "Souper Cubes Silicone Freezer Trays", searchQ: "Souper+Cubes+silicone+freezer+tray", img: "", sentence: "Food grade silicone trays for freezing purees in measured portions. Pop out, transfer to glass for long storage.", badges: ["Food grade silicone"], tag: null },
    ]
  },
  {
    id: "diapers",
    name: "Diapers & wipes",
    tier: "Tier 1 — highest priority",
    blurb: "What touches skin all day, every day. Look for: no fragrance, no lotion, chlorine free, third party tested for VOCs.",
    products: [
      { name: "Kudos Cotton Lined Diapers", searchQ: "Kudos+cotton+diapers", img: "", sentence: "The only disposable with cotton against baby's skin instead of synthetic topsheet. No fragrance, no chlorine, no lotion.", badges: ["Cotton topsheet"], tag: "Editor pick" },
      { name: "Coterie Diapers", searchQ: "Coterie+diapers", img: "616umIINRjL", sentence: "Fully disclosed ingredient list, excellent absorbency. Available on Amazon, no subscription required.", badges: ["Fully disclosed"], tag: null },
      { name: "Healthynest Diapers", searchQ: "Healthynest+diapers", img: "", sentence: "MADE SAFE certified, no fragrance, no lotion. Plant based topsheet, third party tested for VOCs.", badges: ["MADE SAFE"], tag: null },
      { name: "HealthyBaby Diapers", searchQ: "HealthyBaby+diapers", img: "71chvdNIy7L", sentence: "Every material reviewed against the EWG database. Plant based topsheet, no fragrance, chlorine, or latex.", badges: ["EWG Verified"], tag: null },
      { name: "GroVia Cloth Diapers", searchQ: "GroVia+cloth+diapers+organic+cotton", img: "", sentence: "Hybrid system with organic cotton inserts and PUL outer. Most plastic free path with the lowest learning curve.", badges: ["Organic cotton"], tag: null },
      { name: "Esembly Cloth Diapers", searchQ: "Esembly+cloth+diaper+system", img: "", sentence: "Two part system with the cleanest PUL on the market. Organic cotton inner, designed for closed loop laundering.", badges: ["GOTS cotton inner"], tag: null },
      { name: "Thirsties Cloth Diapers", searchQ: "Thirsties+cloth+diaper+hemp+organic", img: "", sentence: "Hemp and organic cotton inserts with a soft PUL cover. Made in the USA, very durable across multiple kids.", badges: ["Hemp + cotton"], tag: "Best value" },
      { name: "WaterWipes", searchQ: "WaterWipes+baby+wipes", img: "81PXdcO16XL", sentence: "Only two ingredients: water plus 0.1% fruit extract. The gold standard for wipe ingredient minimalism.", badges: ["2 ingredients"], tag: null },
      { name: "Caboo Bamboo Wipes", searchQ: "Caboo+bamboo+baby+wipes", img: "", sentence: "Bamboo and sugarcane substrate, 99% water plus chamomile and aloe. No fragrance, no phenoxyethanol.", badges: ["Plant fiber"], tag: null },
      { name: "Earth Mama Organic Diaper Balm", searchQ: "Earth+Mama+diaper+balm", img: "71KzXB188sL", sentence: "Organic herbs in olive oil and beeswax. Used in hospital NICUs, no petroleum, no fragrance.", badges: ["EWG Verified"], tag: "NICU trusted" },
      { name: "Motherlove Diaper Balm", searchQ: "Motherlove+diaper+balm", img: "", sentence: "Calendula and yarrow in olive oil and beeswax base. Avoid petroleum, fragrance and mineral oil in daily creams.", badges: ["Organic herbs"], tag: null },
      { name: "Naturepedic Organic Cotton Changing Pad", searchQ: "Naturepedic+organic+changing+pad", img: "41DZFMFm6FL", sentence: "Same logic as the crib mattress: organic cotton, no flame retardants, food grade PE waterproofing instead of contoured polyurethane foam.", badges: ["Organic cotton", "No PVC"], tag: "Editor pick" },
      { name: "Burt's Bees Baby Organic Changing Pad Cover", searchQ: "Burts+Bees+Baby+organic+changing+pad+cover", img: "", sentence: "GOTS organic cotton, soft terry. Two to three covers minimum since these wash often.", badges: ["GOTS organic"], tag: null },
      { name: "MakeMake Organics Changing Pad Cover", searchQ: "MakeMake+Organics+changing+pad+cover", img: "", sentence: "GOTS organic cotton with a snug knit fit. Avoid waterproof covers backed with PVC or PFAS.", badges: ["GOTS organic"], tag: null },
      { name: "Ubbi Stainless Steel Diaper Pail", searchQ: "Ubbi+stainless+steel+diaper+pail", img: "", sentence: "Stainless steel body, uses any standard kitchen bag. Skip Diaper Genie style pails with proprietary plastic cartridges.", badges: ["Stainless steel"], tag: null }
    ]
  },
  {
    id: "bath",
    name: "Bath & body",
    tier: "Tier 1 — highest priority",
    blurb: "Short ingredient lists and packaging that doesn't shed plastic into a hot tub.",
    products: [
      { name: "Stokke Flexi Bath", searchQ: "Stokke+Flexi+Bath", img: "61ThooJ47CL", sentence: "Polypropylene tub with no PVC, no phthalates, no BPA. Foldable for small bathrooms, the cleanest tub at this size.", badges: ["No PVC, BPA, phthalates"], tag: null },
      { name: "Under the Nile Organic Cotton Hooded Towel", searchQ: "Under+the+Nile+organic+cotton+hooded+towel", img: "", sentence: "GOTS organic cotton terry. The cleanest material pick, skip bamboo viscose marketed as natural.", badges: ["GOTS organic"], tag: "Editor pick" },
      { name: "Burt's Bees Baby Organic Hooded Towel", searchQ: "Burts+Bees+Baby+organic+hooded+towel", img: "7155yfK9IqL", sentence: "100% organic cotton with GOTS certification. Affordable and widely available.", badges: ["GOTS organic"], tag: "Best value" },
      { name: "Natemia Organic Turkish Cotton Towel", searchQ: "Natemia+organic+cotton+baby+hooded+towel", img: "8121Ufxl+-L", sentence: "Extra large organic Turkish cotton with dense plush weave. Grows into toddlerhood without thinning.", badges: ["Organic Turkish"], tag: null },
      { name: "Under the Nile Organic Cotton Washcloths", searchQ: "Under+the+Nile+organic+cotton+washcloths", img: "", sentence: "Pack of organic cotton terry washcloths. Skip bamboo, the rayon process undercuts the natural marketing.", badges: ["GOTS organic"], tag: null },
      { name: "Burt's Bees Organic Cotton Washcloths", searchQ: "Burts+Bees+organic+cotton+washcloth", img: "", sentence: "GOTS organic cotton in a pack of multiples. Soft enough for newborn skin, holds up through years of laundering.", badges: ["GOTS organic"], tag: null },
      { name: "Earth Mama Calming Lavender Baby Wash", searchQ: "Earth+Mama+calming+lavender+baby+wash", img: "", sentence: "Castile soap base with organic lavender and chamomile. EWG Verified, ultra short ingredient list, NICU trusted.", badges: ["EWG Verified", "GOTS"], tag: "NICU grade" },
      { name: "Tubby Todd All Over Ointment", searchQ: "Tubby+Todd+All+Over+Ointment", img: "", sentence: "Plant based ointment for diaper rash, eczema and dry patches. Most newborns do not need daily lotion.", badges: ["Fragrance free"], tag: "Editor pick" },
      { name: "Earth Mama Baby Lotion", searchQ: "Earth+Mama+baby+lotion", img: "", sentence: "Light organic lotion for occasional dry patches. Avoid fragrance, phenoxyethanol, sulfates and PEGs in baby skincare.", badges: ["EWG Verified"], tag: null },
      { name: "Hevea Natural Rubber Whale Bath Toy", searchQ: "Hevea+natural+rubber+whale+bath+toy", img: "", sentence: "Solid one piece natural rubber, no hole means no internal mold. Skip squeezy plastic bath toys, they all grow mold.", badges: ["100% natural rubber"], tag: null },
      { name: "CaaOcho 100% Natural Rubber Bath Toy", searchQ: "CaaOcho+natural+rubber+bath+toy", img: "", sentence: "Pure natural rubber from Hevea trees with no holes or seams. Avoids both microplastic shedding and the bath toy mold problem.", badges: ["100% natural rubber"], tag: null }
    ]
  },
  {
    id: "travel",
    name: "Travel & safety",
    tier: "Tier 2 — flame retardants are unavoidable, choose the cleanest",
    blurb: "Federal flammability standards require flame retardants or naturally flame resistant fabrics. Wool qualifies naturally, everything else uses chemistry.",
    products: [
      { name: "Nuna Pipa RX Infant Car Seat (Merino)", searchQ: "Nuna+Pipa+RX+merino+infant+car+seat", img: "", sentence: "The merino wool version meets federal flammability without chemical flame retardants. Worth the line item for a Tier 1 contact item.", badges: ["No added FR"], tag: "Editor pick" },
      { name: "UPPAbaby Mesa Max Infant Car Seat (Henna)", searchQ: "UPPAbaby+Mesa+Max+Henna+merino+wool", img: "", sentence: "Merino wool fabric meets flammability standards naturally. Verify the current model is the merino Henna version, earlier Evo Pro versions had FR disclosure issues.", badges: ["Merino wool"], tag: null },
      { name: "Clek Foonf Convertible Car Seat", searchQ: "Clek+Foonf+merino+wool+convertible+car+seat", img: "", sentence: "Clek's merino wool fabric is the cleanest convertible option on the market. Steel anti rebound bar, rear face to 50 lbs.", badges: ["Merino wool"], tag: "Editor pick" },
      { name: "Clek Fllo Convertible Car Seat", searchQ: "Clek+Fllo+merino+wool+convertible+car+seat", img: "", sentence: "The slim version of the Foonf, three across friendly. Merino wool fabric, no added flame retardants.", badges: ["Merino wool"], tag: null },
      { name: "Nuna Rava Convertible Car Seat", searchQ: "Nuna+Rava+convertible+car+seat", img: "", sentence: "Greenguard Gold certified with no added flame retardants. Cleanest non merino convertible, slightly bulkier than Clek.", badges: ["GREENGUARD Gold"], tag: null },
      { name: "UPPAbaby Vista Stroller", searchQ: "UPPAbaby+Vista+stroller", img: "", sentence: "Greenguard Gold certified fabrics, the most transparent stroller brand on flame retardant disclosure. Grows from one to three kids.", badges: ["GREENGUARD Gold"], tag: null },
      { name: "Bugaboo Fox Stroller", searchQ: "Bugaboo+Fox+stroller", img: "", sentence: "Premium European stroller with disclosed materials. All terrain wheels, holds up through multiple kids.", badges: ["Disclosed materials"], tag: null },
      { name: "Ergobaby Omni Breeze Carrier", searchQ: "Ergobaby+Omni+Breeze+carrier", img: "", sentence: "Mesh option for hot climates. Mesh is polyester, an honest tradeoff. Choose organic cotton Embrace if your climate allows.", badges: ["Mesh option"], tag: null },
      { name: "Ergobaby Embrace Organic Cotton", searchQ: "Ergobaby+Embrace+organic+cotton+carrier", img: "61gop13VOgL", sentence: "Structured carrier in organic cotton jersey with metal buckles. No foam padding, no plastic hardware.", badges: ["100% organic cotton"], tag: "Editor pick" },
      { name: "LÍLLÉbaby Organic Cotton Carrier", searchQ: "LILLEbaby+organic+cotton+carrier", img: "", sentence: "Organic cotton fabric where available. Ergonomic six position carrier for newborn through toddler.", badges: ["Organic cotton"], tag: null },
      { name: "Solly Baby Wrap (Modal)", searchQ: "Solly+Baby+wrap", img: "81MpilflQtL", sentence: "Modal is semi synthetic. Choose Solly if you need stretch, Boba organic cotton if you want the cleaner fiber.", badges: ["Modal"], tag: null },
      { name: "Boba Wrap Organic Cotton", searchQ: "Boba+Wrap+organic+cotton", img: "", sentence: "GOTS organic cotton, the cleaner fabric pick if you do not need Solly's stretch. One piece, no buckles, no plastic.", badges: ["GOTS organic"], tag: "Editor pick" }
    ]
  },
  {
    id: "clothing",
    name: "Clothing & laundry",
    tier: "Tier 2 — volume matters more than perfection",
    blurb: "Aim for organic cotton on first layer items: onesies, sleepers, anything against skin all day. Outer layers and occasion wear matter less.",
    products: [
      { name: "Burt's Bees Baby Organic Onesies", searchQ: "Burts+Bees+Baby+organic+onesie", img: "", sentence: "GOTS organic cotton with snap or zip closures. Avoid screen printed graphics on the inside of fabric.", badges: ["GOTS organic"], tag: "Best value" },
      { name: "Hanna Andersson Organic Onesies", searchQ: "Hanna+Andersson+organic+cotton+baby+onesie", img: "", sentence: "GOTS organic cotton with non toxic dyes. Heavier weight, lasts through multiple kids.", badges: ["GOTS organic"], tag: "Editor pick" },
      { name: "Kate Quinn Organic Baby", searchQ: "Kate+Quinn+organic+baby+clothes", img: "", sentence: "GOTS organic cotton with low impact dyes and beautiful prints. Designed for layering through seasons.", badges: ["GOTS organic"], tag: null },
      { name: "Hanna Andersson Footed Sleepers", searchQ: "Hanna+Andersson+organic+cotton+zipper+sleeper", img: "", sentence: "Organic cotton zip up sleepers. Avoid polyester fleece footed sleepers, that is synthetic against skin all night.", badges: ["GOTS organic"], tag: null },
      { name: "Hanna Andersson Snug Fit Pajamas", searchQ: "Hanna+Andersson+organic+cotton+pajamas", img: "", sentence: "Snug fit cotton PJs are exempt from federal flame retardant treatment requirements. Avoid loose flame resistant poly pajamas.", badges: ["No FR chemicals"], tag: "Editor pick" },
      { name: "Burt's Bees Organic Cotton Socks", searchQ: "Burts+Bees+organic+cotton+baby+socks", img: "", sentence: "Organic cotton socks. Skip socks with rubber or PVC grippers on the bottoms, silicone or stitched grip is fine.", badges: ["GOTS organic"], tag: null },
      { name: "Zutano Cotton Booties", searchQ: "Zutano+cotton+booties", img: "", sentence: "Cotton booties that actually stay on. The classic stand by for newborns who kick off everything else.", badges: ["100% cotton"], tag: null },
      { name: "Burt's Bees Organic Hat & Mitten Set", searchQ: "Burts+Bees+organic+cotton+baby+hat+mitten", img: "", sentence: "Organic cotton hats for daily use. Reach for wool when you need outdoor cold weather, naturally FR and breathable.", badges: ["GOTS organic"], tag: null },
      { name: "Patagonia Baby Reversible Tribbles Jacket", searchQ: "Patagonia+Baby+Reversible+Tribbles", img: "", sentence: "Outerwear is hard in natural fiber. Patagonia's PFC free DWR is the cleanest synthetic option, recycled polyester shell.", badges: ["PFC free DWR"], tag: null },
      { name: "Branch Basics Concentrate", searchQ: "Branch+Basics+concentrate+laundry", img: "", sentence: "Wash all baby clothing twice before first wear to remove formaldehyde wrinkle treatments and dye residue. Branch Basics is fragrance free and EWG Verified.", badges: ["EWG Verified"], tag: "Editor pick" },
      { name: "Molly's Suds Laundry Powder", searchQ: "Molly%27s+Suds+laundry+powder", img: "", sentence: "Five ingredient powder, no fragrance, no synthetic surfactants. The simplest baby laundry option.", badges: ["5 ingredients"], tag: "Best value" },
      { name: "Dirty Labs Bio Enzyme Baby Laundry", searchQ: "Dirty+Labs+baby+laundry+detergent", img: "", sentence: "Concentrated bio enzyme detergent in glass amber bottles. EWG Verified, no synthetic fragrance.", badges: ["EWG Verified"], tag: null }
    ]
  },
  {
    id: "play",
    name: "Play & development",
    tier: "Tier 2 — minimize mouthing of unknown plastics",
    blurb: "Natural materials and well vetted brands beat the soft, flexible plastics that hide phthalates.",
    products: [
      { name: "Hevea Natural Rubber Teether", searchQ: "Hevea+natural+rubber+teether", img: "71bTuBGHAuL", sentence: "Single piece natural rubber from Hevea brasiliensis. No additives, no PVC, no BPA, no seams where mold can hide.", badges: ["100% natural rubber"], tag: "Editor pick" },
      { name: "CaaOcho Natural Rubber Toys", searchQ: "CaaOcho+natural+rubber+toy", img: "71fskHrcq6L", sentence: "Pure natural rubber, single piece construction with no openings where mold can grow. Painted with food grade colors.", badges: ["100% natural rubber"], tag: null },
      { name: "Sophie la Girafe", searchQ: "Sophie+la+Girafe+teether", img: "81xxNpO3KML", sentence: "100% natural rubber with food grade paint. In production since 1961, sixty plus year safety record.", badges: ["Natural rubber"], tag: null },
      { name: "Mushie Silicone Teether", searchQ: "Mushie+silicone+teether", img: "61+faUIK2AL", sentence: "Food grade silicone, durable enough to be boiled. Skip if going for a true natural material, otherwise the next best option.", badges: ["Food grade silicone"], tag: "Best value" },
      { name: "PlanToys Wooden Toys", searchQ: "PlanToys+wooden+toys", img: "813DX4MJpaL", sentence: "Chemical free kiln dried rubberwood with water based dyes and formaldehyde free E Zero glue.", badges: ["FSC rubberwood"], tag: "Editor pick" },
      { name: "Hape Wooden Toys", searchQ: "Hape+wooden+baby+toys", img: "", sentence: "Sustainable wood with non toxic water based finishes. Wide product range from infant rattles to preschool sets.", badges: ["Water based finish"], tag: null },
      { name: "Manhattan Toy Skwish", searchQ: "Manhattan+Toy+Skwish", img: "", sentence: "Classic wooden grasping toy with elastic cords. Solid wood, water based finishes, made for tiny hands.", badges: ["Solid wood"], tag: null },
      { name: "Grimm's Rainbow Stacker", searchQ: "Grimms+rainbow+stacker", img: "", sentence: "Linden wood with non toxic water based stains. Open ended Waldorf classic that lasts decades.", badges: ["Solid wood"], tag: null },
      { name: "Hevea Natural Rubber Rattle", searchQ: "Hevea+natural+rubber+rattle", img: "", sentence: "Natural rubber rattles for infant grasping. Skip plastic shaker rattles, they often hide phthalate soft plastic.", badges: ["100% natural rubber"], tag: null },
      { name: "Manhattan Toy Wooden Rattle", searchQ: "Manhattan+Toy+wooden+rattle", img: "", sentence: "Solid wood rattles with water based finishes. Heirloom durable, beautiful textures for sensory play.", badges: ["Solid wood"], tag: null },
      { name: "Toki Mats Organic Cotton Play Mat", searchQ: "Toki+Mats+organic+cotton+kapok+play+mat", img: "815gF9hP78L", sentence: "Organic cotton cover with kapok fill. No foam, no PVC, no EVA, no synthetic fill of any kind.", badges: ["GOTS + kapok"], tag: "Editor pick" },
      { name: "Gathre Vegan Leather Mat", searchQ: "Gathre+vegan+leather+mat", img: "", sentence: "TPU rather than PVC, far better than foam interlocking tiles. Wipes clean, rolls up for travel.", badges: ["TPU, no PVC"], tag: null },
      { name: "Lovevery Play Gym", searchQ: "Lovevery+Play+Gym", img: "", sentence: "Wood frame with organic cotton mat. Toys are mixed materials but well vetted. Skip plastic dome gyms.", badges: ["Wood + organic cotton"], tag: null },
      { name: "Estella Organic Cloth Books", searchQ: "Estella+organic+cotton+cloth+book", img: "", sentence: "Organic cotton cloth books for babies who chew everything. Soy based inks. Skip vinyl bath books.", badges: ["GOTS organic"], tag: null },
      { name: "Senger Naturwelt Wool Stuffies", searchQ: "Senger+Naturwelt+wool+stuffed+animal", img: "", sentence: "Wool body and stuffing with cotton stitching. Heirloom durable, fully compostable at end of life.", badges: ["100% wool"], tag: null },
      { name: "Under the Nile Organic Cotton Stuffies", searchQ: "Under+the+Nile+organic+cotton+stuffed+animal", img: "", sentence: "GOTS organic cotton with cotton stuffing. Safe for crib age, machine washable.", badges: ["GOTS organic"], tag: null },
      { name: "Apple Park Organic Stuffed Animals", searchQ: "Apple+Park+organic+cotton+stuffed+animal", img: "", sentence: "GOTS certified organic cotton with corn fiber filling. Beautifully designed, safe from birth.", badges: ["GOTS organic"], tag: null }
    ]
  },
  {
    id: "health",
    name: "Health & first aid",
    tier: "Tier 3 — pragmatic picks",
    blurb: "Standards of care that work. Some plastic is unavoidable here, the goal is short contact and clean ingredient lists.",
    products: [
      { name: "Frida Baby Quick Read Rectal Thermometer", searchQ: "Frida+Baby+rectal+thermometer", img: "", sentence: "Pediatricians recommend rectal under three months for accuracy. Skip forehead and ear scanners for newborns.", badges: ["Pediatrician recommended"], tag: null },
      { name: "NoseFrida Nasal Aspirator", searchQ: "NoseFrida+nasal+aspirator", img: "", sentence: "Parent powered, fully cleanable. Plastic but it is the standard of care, and contact is brief.", badges: ["Cleanable"], tag: null },
      { name: "Frida Baby Electric Nail File", searchQ: "Frida+Baby+electric+nail+file", img: "", sentence: "Safer than clippers in the newborn period. Skip clippers until baby has more nail to work with.", badges: ["Newborn safe"], tag: null },
      { name: "Genexa Saline Drops", searchQ: "Genexa+saline+drops+baby", img: "", sentence: "Clean ingredient saline for stuffy noses. Skip natural colic drops with proprietary blends.", badges: ["Clean ingredients"], tag: null },
      { name: "Earth Mama Gripe Water", searchQ: "Earth+Mama+gripe+water", img: "", sentence: "Transparent ingredient list with organic chamomile, ginger, and fennel. Use only if needed for fussiness.", badges: ["Transparent ingredients"], tag: null },
      { name: "Babo Botanicals Sheer Zinc Sunscreen", searchQ: "Babo+Botanicals+Sheer+Zinc+SPF+50", img: "", sentence: "Mineral zinc oxide only. Avoid chemical sunscreens (oxybenzone, octinoxate). Under six months: shade and clothing only.", badges: ["Mineral only"], tag: "Editor pick" },
      { name: "Earth Mama Baby Mineral Sunscreen SPF 40", searchQ: "Earth+Mama+Baby+Mineral+Sunscreen+SPF+40", img: "", sentence: "25% non nano zinc oxide, EWG verified, fragrance free. Midwife founded brand, gentle for newborn and toddler skin.", badges: ["EWG Verified", "Non nano zinc"], tag: "Best for kids" }
    ]
  },
  {
    id: "misc",
    name: "Monitors & misc",
    tier: "Tier 3 — the rest of the registry",
    blurb: "Baby monitor, white noise, pacifiers, bag, keepsakes. Choose transparency and durability over features you'll never use.",
    products: [
      { name: "Eufy SpaceView Baby Monitor", searchQ: "Eufy+SpaceView+baby+monitor", img: "", sentence: "Local only monitor, no cloud, no wifi exposure. The most transparent brand on data privacy.", badges: ["Local, no cloud"], tag: "Editor pick" },
      { name: "Nanit Pro Smart Baby Monitor", searchQ: "Nanit+Pro+smart+baby+monitor", img: "", sentence: "Wifi monitor with sleep tracking and breathing analysis. More features but cloud dependent, choose Eufy if EMF concerns matter.", badges: ["Cloud features"], tag: null },
      { name: "Yogasleep Dohm White Noise Machine", searchQ: "Yogasleep+Dohm+white+noise", img: "", sentence: "Mechanical fan inside, no electronics, lowest EMF option. The oldest, simplest white noise machine on the market.", badges: ["Mechanical, low EMF"], tag: "Editor pick" },
      { name: "Hatch Rest+ White Noise Machine", searchQ: "Hatch+Rest+Plus+white+noise", img: "", sentence: "Wifi sound machine with night light and time to rise features. More featured but it is a wifi device.", badges: ["Wifi features"], tag: null },
      { name: "Natursutten Natural Rubber Pacifier", searchQ: "Natursutten+natural+rubber+pacifier", img: "", sentence: "100% natural rubber, single piece, no joints to harbor mildew. The cleanest pacifier material available.", badges: ["100% natural rubber"], tag: "Editor pick" },
      { name: "Hevea Natural Rubber Pacifier", searchQ: "Hevea+natural+rubber+pacifier", img: "", sentence: "One piece natural rubber pacifier. Skip silicone if going for a true natural material, otherwise silicone is the next best option.", badges: ["100% natural rubber"], tag: null },
      { name: "Storksak Organic Cotton Diaper Bag", searchQ: "Storksak+organic+cotton+diaper+bag", img: "", sentence: "GOTS organic cotton with metal hardware. Skip PVC coated wipeable bags, the coating is the problem.", badges: ["GOTS organic"], tag: null },
      { name: "Freshly Picked Vegan Leather Diaper Bag", searchQ: "Freshly+Picked+diaper+bag", img: "", sentence: "TPU vegan leather rather than PVC. Wipes clean, holds up through years of daily use.", badges: ["TPU, no PVC"], tag: null },
      { name: "Lucy Darling Baby Memory Book", searchQ: "Lucy+Darling+baby+memory+book", img: "", sentence: "Heirloom quality keepsake book printed on FSC paper. Skip plastic milestone cards, they last weeks not decades.", badges: ["FSC paper"], tag: null },
      { name: "Pearhead Organic Cotton Milestone Blanket", searchQ: "Pearhead+organic+cotton+milestone+blanket", img: "", sentence: "Organic cotton monthly photo blanket. Doubles as a swaddle or stroller blanket after the photo year.", badges: ["GOTS organic"], tag: null }
    ]
  }
];

// Find products that need scraping (img is empty and have searchQ)
const toScrape = [];
for (const cat of REGISTRY) {
  for (const p of cat.products) {
    if (!p.img && p.searchQ) toScrape.push({ q: p.searchQ, label: cat.id + ":" + p.name });
  }
}
console.log("Total products:", REGISTRY.reduce((s, c) => s + c.products.length, 0));
console.log("Need scraping:", toScrape.length);

module.exports = { REGISTRY, toScrape };
