import type {SiteThemeDefinition,ThemeDecoration,ThemeMotif,ThemeArtStyle} from './model.ts';
import {natureArt} from './nature-art.ts';
import type {ThemeTokens} from '../preferences/themes.ts';
// Curated, data-only palettes. No executable CSS, uploaded markup, or hidden global switches.
function palette(id:string,name:string,category:string,mood:string,nav:string,accent:string,highlight:string,canvas:string,soft:string,softAlt:string,line:string,navEnd=nav):SiteThemeDefinition{
 const tokens:ThemeTokens={nav,navEnd,accent,highlight,canvas,soft,softAlt,line,surface:'#ffffff',ink:'#17212b',muted:'#3f4b57'};
 return {id:`seasonal-${id}`,name,category,mood,seasonal:true,tokens,colors:[nav,accent,highlight,soft,canvas]};
}
const originalSeasonalThemes:readonly SiteThemeDefinition[]=[
 palette('christmas-evergreen','Evergreen & Gold','Christmas','Rich evergreen with a golden glow','#064b32','#b51732','#ffd166','#f5f8f6','#e7f3ec','#fff2d1','#bacfc1','#032e20'),
 palette('christmas-cranberry','Cranberry Christmas','Christmas','Cranberry with snowy ivory','#741328','#b01835','#ffd775','#fff8f8','#ffe8ec','#fff3dc','#d7bac2','#4e0b1b'),
 palette('thanksgiving-harvest','Harvest Table','Thanksgiving','Warm copper and autumn cream','#402816','#895016','#e9bc78','#faf7ef','#f7efdf','#f8e9dc','#ddcfb8','#302414'),
 palette('thanksgiving-cranberry','Copper & Cranberry','Thanksgiving','Deep berry with soft copper','#462637','#8c3d34','#deb18b','#fbf6f3','#f6eae6','#f4eaf0','#dcc8c1','#32202d'),
 palette('valentine-rose','Rose Notes','Valentine’s Day','Soft rose with confident burgundy','#4c2038','#963357','#e7a4b6','#fcf5f8','#faeaf1','#f6edf4','#ddc3cd','#35182d'),
 palette('valentine-plum','Plum & Blush','Valentine’s Day','A quiet plum and blush pairing','#342343','#70416f','#d8afd0','#f9f5fb','#f3eaf7','#f9ecf1','#d3c4dc','#251b34'),
 palette('independence-liberty','Liberty Blue','Independence Day','Navy, red, and clean white','#172e53','#9c2d3a','#bed6ef','#f6f8fc','#eaf0fa','#fae9eb','#c4cede','#12213a'),
 palette('independence-stars','Stars & Stripes','Independence Day','Bold blue with a scarlet accent','#222b46','#28518b','#edb6b4','#f7f8fc','#edf0f9','#f9eceb','#c7ccde','#1a2034'),
 palette('black-history-heritage','Heritage Gold','Black History Month','Deep charcoal and gold','#191919','#66501a','#e4bc54','#faf8f1','#f5efd9','#edf3e8','#d7ceb2','#090909'),
 palette('black-history-unity','Unity & Legacy','Black History Month','Forest, garnet, and warm gold','#153b2c','#922d3b','#d8b855','#f8f8f1','#eaf2e7','#f9eaeb','#c8d1ba','#102b22'),
 palette('easter-meadow','Lavender Meadow','Easter','Spring lavender and gentle sage','#3f305c','#65508a','#c6d6b1','#f8f6fc','#f0eafa','#eef4e6','#d0c8de','#2c2245'),
 palette('easter-sky','Easter Sky','Easter','Airy blue with pastel warmth','#22445b','#306e83','#edcf95','#f5fafc','#e7f2f8','#fbf2e1','#bdd5df','#1b3348'),
 palette('halloween-pumpkin','Midnight Pumpkin','Halloween','Midnight charcoal and pumpkin','#26202b','#945015','#e8a353','#fbf7f1','#f8eddf','#f0eaf5','#d8cbbd','#16121c'),
 palette('halloween-plum','Haunted Plum','Halloween','Rich plum with a lime spark','#322044','#68457a','#c6d98d','#f8f5fb','#f0e9f6','#f1f5e5','#d0c5db','#21172f'),
 palette('newyear-midnight','Midnight Gold','New Year','Dark navy and celebration gold','#1b2440','#5b4a22','#e9ca71','#faf8f2','#f6efdc','#edf0f8','#d8d0b8','#12192d'),
 palette('newyear-silver','Silver Horizon','New Year','Cool blue and polished silver','#263748','#3e5d79','#cbd8e5','#f5f8fb','#eaf0f7','#eef2f5','#c6d0da','#1a2938'),
 palette('fall-maple','Maple Season','Fall','Russet with sunlit maple','#422c23','#8d4b29','#e1af65','#fcf7ef','#f8eddf','#f4ece8','#dfcdbd','#30231c'),
 palette('fall-cedar','Cedar Trail','Fall','Forest green and soft sandstone','#273d31','#4d6841','#d5bc8d','#f7f8f1','#edf2e4','#f6eee1','#ced4be','#1d2c25'),
 palette('summer-coast','Summer Coast','Summer','Teal water and pale sand','#154853','#226979','#edc580','#f3fafb','#e1f2f4','#fcf1dd','#bbd8da','#10353f'),
 palette('summer-citrus','Citrus Days','Summer','Leaf green with a lemon accent','#31462c','#53702e','#f0d968','#f9faf0','#f0f4df','#fcf5d9','#d0d7b4','#233420'),
 palette('spring-bloom','Spring Bloom','Spring','Fresh garden and soft blossom','#2f4738','#3f6e4e','#e9bacb','#f6faf3','#eaf4e5','#f9ecf2','#c5d9c2','#23372c'),
 palette('spring-rain','April Rain','Spring','Clean indigo and pale periwinkle','#303852','#4d5d8e','#bbc7ee','#f5f7fc','#ecf0fa','#edf4f5','#c9d1e3','#232a41'),
 palette('winter-frost','Winter Frost','Winter','Icy blue with deep evergreen','#23404a','#346473','#bbdae4','#f4f9fb','#e5f0f5','#edf4f4','#c0d5de','#18313b'),
 palette('winter-cabin','Winter Cabin','Winter','Warm espresso and winter ivory','#3d302c','#76533e','#d5b9a0','#faf7f3','#f4ece3','#eff1ed','#d7cbbf','#2b2421'),
];

// Variants combine unique palettes with materially different illustrated compositions.
// All original IDs remain stable so existing selections and schedules survive palette refinements.
type Collection={category:string;motif:ThemeMotif;slug:string;names:string[];moods:string[];federalHoliday?:string;observanceNote?:string;personalOnly?:boolean;bases?:SiteThemeDefinition[]};
const compositions:ThemeDecoration['layout'][]=['garland','corners','scattered','ribbon','border','canopy','constellation','sunburst','bouquet','minimal'];
const intensities:ThemeDecoration['intensity'][]=['festive','balanced','subtle','balanced','subtle','festive','balanced','festive','balanced','subtle'];
const collections:Collection[]=[
 {category:'Christmas',motif:'christmas',slug:'christmas',federalHoliday:'Christmas Day',names:['Evergreen & Gold','Cranberry Christmas','Snowfall at Midnight','Gingerbread Lane','Silver Bells','Fireside Noel','Winterberry Wreath','Starlight Christmas','Forest Celebration','Quiet Christmas'],moods:['Evergreen garlands and gilded ornaments','Cranberry holly at the corners','Snowflakes over a midnight forest','Warm gingerbread ribbon and lights','Silver branches in a fine frame','Hanging boughs and festive ornaments','Winterberries and small glowing stars','Gold stars around a festive centerpiece','A botanical wreath in pine and berry','A quiet ornament accent with generous space']},
 {category:'Thanksgiving',motif:'thanksgiving',slug:'thanksgiving',federalHoliday:'Thanksgiving Day',names:['Harvest Table','Copper & Cranberry','Autumn Gathering','Golden Cornucopia','Thankful Together','Orchard Supper','Candlelit Harvest','Amber Gratitude','Bountiful Branches','Simple Thanks'],moods:['A harvest garland in copper and gold','Cranberry leaves gathered at the corners','Soft autumn leaves scattered across ivory','Golden harvest ribbon and warm accents','A fine leaf frame around the workspace','Orchard branches sweeping overhead','Small harvest stars on warm cream','An amber harvest sunburst','Bountiful foliage and copper leaves','A restrained leaf accent for a calm day']},
 {category:'Valentine’s Day',motif:'valentines',slug:'valentine',names:['Rose Notes','Plum & Blush','Blushing Hearts','Love Letter','Rose Gold Ribbon','Petal Canopy','Sweet Constellation','Heartfelt Glow','Blooming Affection','A Little Love'],moods:['Rose hearts in a gentle garland','Plum and blush corner details','Small floating hearts on warm white','An elegant letter ribbon in rose','A delicate rose-colored border','Petal clusters above the workspace','Tiny hearts and starlight','A warm heart-centered celebration','Rose-inspired bouquets at the edges','One small heart and a clean workspace']},
 {category:'Independence Day',motif:'independence',slug:'independence',federalHoliday:'Independence Day',names:['Liberty Blue','Stars & Stripes','Summer Fireworks','American Ribbon','Blue Star Salute','Patriotic Bunting','Liberty Constellation','Fourth of July Spark','Red White & Bloom','Quiet Liberty'],moods:['A pair of waving parade flags.','An engraved star medallion with a gold rosette.','Fireworks reflected in the water below the skyline.','A copperplate engraving of Independence Hall.','A marching band drum with crossed sticks.','A red, gold, and navy Art Deco fan.','A gingham picnic basket and watermelon.','A celestial map traced in gold against midnight blue.','Festival rockets with looping trails.','A letterpress Roman numeral IV framed by printer’s ornaments.']},
 {category:'Black History Month',motif:'black-history',slug:'black-history',names:['Heritage Gold','Unity & Legacy','Legacy in Color','History in Motion','Golden Heritage','Voices of Progress','Legacy Constellation','Celebrating Achievement','Roots & Futures','Everyday Excellence'],moods:['Gold and geometric heritage details','Forest, garnet, and gold accents','Celebratory color in a scattered pattern','An elegant ribbon honoring achievement','A fine gold geometric frame','A canopy of connected heritage shapes','Gold stars celebrating achievement','A radiant celebration of history','Geometric clusters in deep green and gold','A quiet gold accent with strong typography']},
 {category:'Easter',motif:'easter',slug:'easter',names:['Lavender Meadow','Easter Sky','Pastel Parade','Springtime Ribbon','Eggshell Garden','Blossom Canopy','Morning Dew','Easter Sunrise','Wildflower Basket','Quiet Meadow'],moods:['Lavender flowers and spring garlands','Sky blue and gentle pastel corners','Pastel eggs and blossoms scattered lightly','A spring ribbon in lavender and blue','A delicate floral and egg border','Blossoms gathered above the workspace','Tiny flowers with morning-light accents','A warm spring sunrise celebration','Wildflower clusters and a pastel palette','One gentle flower with ample white space']},
 {category:'Halloween',motif:'halloween',slug:'halloween',names:['Midnight Pumpkin','Haunted Plum','Pumpkin Confetti','Twilight Trick or Treat','Moonlit Border','Autumn Spell','Midnight Constellation','Jack-o’-Lantern Glow','Pumpkin Patch','Quiet Halloween'],moods:['Pumpkins and autumn leaves in a garland','Plum moonlight at the corners','Little pumpkins across warm ivory','A playful Halloween ribbon','A charcoal frame with autumn accents','A canopy of leaves and pumpkins','Small stars in a rich midnight palette','A glowing pumpkin centerpiece','Pumpkin clusters at the workspace edges','A single pumpkin accent in warm charcoal']},
 {category:'New Year',motif:'new-year',slug:'newyear',federalHoliday:'New Year’s Day',names:['Midnight Gold','Silver Horizon','Confetti Countdown','Fresh Start Ribbon','New Chapter','Champagne Lights','Midnight Stars','Bright Beginnings','Golden Wishes','Clear Horizon'],moods:['Celebration stars in midnight and gold','Cool silver corners and clean blue','Confetti scattered over a fresh canvas','A gold ribbon marking a fresh start','A refined frame for a new chapter','Hanging stars and champagne highlights','A constellation of midnight lights','Radiant gold around the day’s priorities','Gold and silver celebratory clusters','A quiet star and a clear workspace']},
 {category:'Fall',motif:'fall',slug:'fall',names:['Maple Season','Cedar Trail','Falling Leaves','Autumn Ribbon','Oak & Amber','Woodland Canopy','Harvest Stars','Amber Afternoon','Maple Bouquet','Quiet Woodland'],moods:['Maple leaves in a warm garland','Cedar and sandstone corners','Falling leaves in a soft scattered pattern','An autumn ribbon in russet and cream','A fine oak leaf frame','A woodland canopy with golden foliage','Small autumn accents across a dark palette','A warm amber centerpiece','Maple and cedar gathered at the edges','One leaf accent with earthy calm']},
 {category:'Summer',motif:'summer',slug:'summer',names:['Summer Coast','Citrus Days','Seaside Sparkle','Boardwalk Breeze','Coastal Frame','Palm Shade','Summer Nights','Sunshine State of Mind','Tropical Escape','Calm Coast'],moods:['Teal waves and sunlit garlands','Citrus colors at the corners','Small seaside accents and blue sparkle','A breezy ribbon of sand and sea','A light coastal border','Palm-inspired canopy and cool teal','A constellation of summer stars','A sunburst over bright summer colors','Tropical foliage and warm sunshine','A single wave accent in cool blue']},
 {category:'Spring',motif:'spring',slug:'spring',names:['Spring Bloom','April Rain','Wildflower Confetti','Fresh Start Garden','Blossom Border','New Leaves','Spring Starlight','Morning Bloom','Garden Bouquet','Fresh Air'],moods:['Fresh flowers in a spring garland','Periwinkle rain and garden corners','Small wildflowers across a clean canvas','A green ribbon and fresh blossom accents','A delicate spring flower frame','A canopy of fresh leaves','Small blossom stars in cool colors','A radiant spring flower centerpiece','Soft garden bouquets at the edges','One fresh leaf and an airy workspace']},
 {category:'Winter',motif:'winter',slug:'winter',names:['Winter Frost','Winter Cabin','Snowfall','Frosted Ribbon','Ice Crystal Frame','Pine Shelter','Northern Stars','Winter Sunrise','Snowy Branches','Still Winter'],moods:['Frosted branches and ice-blue garlands','Warm cabin corners and ivory snow','Gentle snowflakes over a clear field','A frosted ribbon in deep evergreen','A fine ice-crystal border','Pine branches sheltering the header','A crisp constellation of northern stars','A cool winter sunrise centerpiece','Snowy branches gathered at the edges','A small snowflake and a quiet canvas']},
 {category:'Martin Luther King Jr. Day',motif:'mlk',slug:'mlk',federalHoliday:'Birthday of Martin Luther King, Jr.',names:['Dream Forward','Beloved Community','Steps Toward Justice','Legacy of Service','Peace & Purpose','Together We Rise','Guiding Lights','A Brighter Tomorrow','Community in Bloom','Quiet Reflection'],moods:['Peaceful ribbons and a dignified gold palette','Deep blue and community-inspired corner motifs','Small lights marking progress','A service ribbon in indigo and gold','A refined frame for reflection','A connected canopy honoring community','Guiding stars in a calm midnight palette','A hopeful sunburst in blue and gold','Peaceful botanical clusters','A restrained dove-inspired accent'],bases:[palette('mlk-dream-forward','Dream Forward','Martin Luther King Jr. Day','', '#1f3152','#425c83','#dbc179','#f7f8fc','#edf1f9','#f7f0df','#c8d0df'),palette('mlk-beloved-community','Beloved Community','Martin Luther King Jr. Day','', '#2d3642','#5e5d3b','#d0bd76','#f9f8f1','#f2efd9','#edf2f5','#d4cfbb')]},
 {category:'Memorial Day',motif:'memorial',slug:'memorial',federalHoliday:'Memorial Day',names:['Remembrance','Poppy & Navy','Quiet Honor','Memorial Ribbon','Laurel Remembrance','Honoring Service','Stars of Remembrance','Dawn of Reflection','Poppies of Honor','Always Remembered'],moods:['Respectful laurel garlands in navy and ivory','Poppy-red corners and deep blue','Restrained stars on a quiet field','A dignified remembrance ribbon','A fine laurel border','A respectful canopy of laurel branches','Small stars in a subdued midnight palette','A muted sunrise for reflection','Poppy-inspired clusters at the edges','A single remembrance accent'],bases:[palette('memorial-remembrance','Remembrance','Memorial Day','', '#26313d','#536679','#d9c4a2','#f8f8f7','#eef1f3','#f7f0e8','#ccd0d1'),palette('memorial-poppy-navy','Poppy & Navy','Memorial Day','', '#28354c','#943f46','#dca7a2','#faf7f7','#f8ebeb','#ecf0f8','#d7c8cc')]},
 {category:'Juneteenth',motif:'juneteenth',slug:'juneteenth',federalHoliday:'Juneteenth National Independence Day',names:['Freedom Day','Juneteenth Jubilee','Freedom Stars','New Horizons','Legacy & Freedom','Community Celebration','Freedom Constellation','A New Dawn','Red Bloom Celebration','Reflecting on Freedom'],moods:['Freedom stars in red, blue, and white','Joyful corners in a bold celebration palette','Bright stars scattered lightly','A ribbon marking new horizons','A precise freedom-star frame','A canopy of celebratory stars','A constellation honoring freedom','A radiant new-day celebration','Red and blue star clusters','A single freedom star and a clear canvas'],bases:[palette('juneteenth-freedom-day','Freedom Day','Juneteenth','', '#183652','#8b2f42','#e4b0ac','#faf7f7','#f8e9ec','#eaf1f8','#d4c5ce'),palette('juneteenth-jubilee','Juneteenth Jubilee','Juneteenth','', '#253744','#315b86','#e8bec2','#f6f8fc','#eaf0f9','#f8eaf0','#c5cfe0')]},
 {category:'Labor Day',motif:'labor',slug:'labor',federalHoliday:'Labor Day',names:['Built Together','Work & Worth','Teamwork in Motion','Craft & Care','Pride in Our Work','Stronger Together','Everyday Contributors','Progress Ahead','Tools of the Trade','Earned Rest'],moods:['Work-inspired geometric garlands','Strong blue and copper corners','Small tool-inspired accents across ivory','A crafted ribbon in slate and gold','A precise geometric border','A canopy of connected shapes','A constellation honoring contributors','A warm celebration of shared progress','Tool-inspired clusters and bold colors','One quiet emblem and a calm workspace'],bases:[palette('labor-built-together','Built Together','Labor Day','', '#263d46','#356778','#d4b77e','#f6f9fa','#eaf2f4','#f8f0df','#c6d3d7'),palette('labor-work-worth','Work & Worth','Labor Day','', '#41362c','#875234','#d2b28e','#faf7f2','#f6ecdf','#eef1f2','#d6ccbd')]},
 {category:'Veterans Day',motif:'veterans',slug:'veterans',federalHoliday:'Veterans Day',names:['Service & Honor','Veterans Salute','Stars of Service','Honor Ribbon','Laurel of Thanks','Grateful Nation','Service Constellation','A Salute at Dawn','Honor & Appreciation','With Gratitude'],moods:['Dignified stars and laurel garlands','Deep blue and warm gold corners','Small stars honoring service','A respectful ribbon of appreciation','A fine laurel border in navy and gold','A canopy of stars and laurel','A constellation recognizing service','A restrained gold sunburst','Laurel clusters at the workspace edges','One star with a quiet expression of thanks'],bases:[palette('veterans-service-honor','Service & Honor','Veterans Day','', '#25364c','#4e627e','#d1b77a','#f8f9fb','#edf1f7','#f7f0df','#cad1dc'),palette('veterans-salute','Veterans Salute','Veterans Day','', '#3a3442','#7e454d','#d8bd98','#faf7f7','#f5ebee','#f7f0e4','#d4c7d0')]},
 {category:'Birthday',motif:'birthday',slug:'birthday',personalOnly:true,names:['Birthday Confetti','Golden Birthday','Birthday Balloons','Birthday Cake','Birthday Wishes','Birthday Garden','Birthday Sky','Birthday Coral','Birthday Lavender','Birthday Night'],moods:['Bright confetti for your personal celebration','Gold celebration details at the corners','Balloons scattered over a clear canvas','A festive cake-and-ribbon celebration','A border of tiny birthday stars','Flowers and birthday bunting overhead','Your own constellation of birthday wishes','A warm birthday sunburst','Lavender celebration bouquets','A quiet birthday star on midnight blue'],bases:[palette('birthday-confetti','Birthday Confetti','Birthday','', '#273e53','#785094','#e7be71','#f8f8fc','#f0eafa','#fcf2dc','#d4c9df'),palette('birthday-gold','Golden Birthday','Birthday','', '#3a3540','#76603b','#e5c775','#faf8f2','#f6f0de','#f2edf6','#d9cfbb')]},
];
function blend(a:string,b:string,ratio:number){const A=a.slice(1).match(/../g)!.map(x=>parseInt(x,16)),B=b.slice(1).match(/../g)!.map(x=>parseInt(x,16));return '#'+A.map((v,i)=>Math.round(v*(1-ratio)+B[i]*ratio).toString(16).padStart(2,'0')).join('');}
function paletteVariant(base:SiteThemeDefinition,alternate:SiteThemeDefinition,index:number):ThemeTokens{
 const mixes=[.15,.28,.41,.54,.67,.23,.36,.49],ratio=mixes[index-2],left=index%2?alternate.tokens:base.tokens,right=index%2?base.tokens:alternate.tokens;
 const nav=blend(left.nav,right.nav,ratio),accent=blend(left.accent,right.accent,ratio*.8),highlight=blend(left.highlight,right.highlight,ratio);
 return {nav,navEnd:blend(nav,'#111722',.22),accent,highlight,ink:'#17212b',muted:'#3f4b57',surface:'#ffffff',canvas:blend('#ffffff',highlight,.075+index*.003),soft:blend('#ffffff',highlight,.17+index*.004),softAlt:blend('#ffffff',left.softAlt,.63),line:blend('#bfc9cc',highlight,.24)};
}
// Explicit Christmas palettes keep evergreen, cranberry, icy blue, and gold crisp.
// Blending complementary red/green anchors made the earlier variants look muddy.
const christmasVariants:ReadonlyArray<readonly [string,string,string,string,string,string,string,string]>=[
 ['#143b58','#075c7a','#d4f0ff','#f6fbff','#e7f3ff','#f0f7ff','#bfd6e5','#082b43'],
 ['#66331d','#9d2e21','#ffd17a','#fffaf4','#ffeed9','#ffebe7','#dec3aa','#42200e'],
 ['#28494c','#1f6663','#d7f4eb','#f6fbfa','#e8f5f1','#eef4f8','#bfd4d1','#163234'],
 ['#6a1726','#9f1c32','#ffd47a','#fff8f5','#ffebe8','#fff2d4','#dfbdb8','#430d19'],
 ['#104a33','#ae1633','#ffe09a','#f7fbf7','#e6f4eb','#fff0e1','#b9d4c3','#073320'],
 ['#133946','#825308','#ffe18b','#f8fbfc','#eaf4f7','#fff2cd','#c4d7db','#082631'],
 ['#0a4932','#16653e','#f6cf76','#f4faf5','#e4f3e8','#fff0d2','#b7d2bd','#062f21'],
 ['#203f38','#395e4c','#e7ce9a','#f8fbf8','#edf5ee','#fff6e7','#c4d4c9','#122c26'],
];
function christmasPalette(index:number):ThemeTokens{
 const [nav,accent,highlight,canvas,soft,softAlt,line,navEnd]=christmasVariants[index-2];
 return {nav,navEnd,accent,highlight,canvas,soft,softAlt,line,surface:'#ffffff',ink:'#17212b',muted:'#3f4b57'};
}
// Additional editions have permanent suffixes; titles and descriptions can evolve independently.
// Each pair has its own foreground palette; the color-only editions contain no art.
type Editions=readonly [string,string,string,string,string,string,string,string];
const editions:Partial<Record<ThemeMotif,Editions>>={
 christmas:['Frosted Evergreen','Winter Holly','Fir & Porcelain','Ruby & Champagne','#10442e','#9d1731','#651329','#a62a30'],
 thanksgiving:['Harvest Gourds','Golden Wheat','Chestnut & Linen','Mulberry Table','#4b311f','#874b23','#462137','#803953'],
 valentines:['Crimson Rose','Blush Peonies','Bordeaux & Blush','Aubergine & Pearl','#591c33','#9d3056','#3a264c','#69376c'],
 independence:['Fireworks Over Water','Prairie Fireflies','Union Blue & Ivory','Old Glory Red','#163259','#245b91','#752134','#91344a'],
 'black-history':['Southern Live Oak','Magnolia Bloom','Onyx & Gold','Emerald & Garnet','#24231e','#69511c','#193c2d','#8a3144'],
 easter:['Easter Lilies','Robin’s Nest','Sage & Linen','Lilac & Ivory','#31473b','#40644d','#483254','#6b477c'],
 halloween:['Lantern at Dusk','Moonlit Branches','Pumpkin & Ink','Plum After Dark','#322522','#885019','#392449','#67447a'],
 'new-year':['First Light','Midnight Sparklers','Midnight & Champagne','Silver & Slate','#1c2d4d','#65502b','#293b48','#43647c'],
 fall:['Scarlet Canopy','Autumn Creek','Maple & Linen','Moss & Sandstone','#512f25','#87402a','#2b4432','#49633b'],
 summer:['Summer Surf','Sunflower Field','Marine & White','Citrus Grove','#174653','#216777','#314f2a','#497035'],
 spring:['Wildflower Meadow','Cherry Blossom','Leaf & Blossom','Rainwashed Blue','#284836','#3c654b','#2c3d51','#475e90'],
 winter:['Alpine Lake','Snowy Birches','Frost & Fir','Alpine Slate','#204542','#376358','#253647','#3c627e'],
 mlk:['Dove of Peace','Reflecting Pool','Indigo & Gold','Laurel & Ivory','#25324e','#45567b','#293c30','#536039'],
 memorial:['Remembrance Poppies','White Lily','Navy & Stone','Laurel & Ivory','#233448','#465d76','#283c31','#49654e'],
 juneteenth:['Gulf Coast Sunrise','Coastal Hibiscus','Freedom Blue','Crimson & Ivory','#183755','#285b85','#662334','#99404b'],
 labor:['Field Rows','Honeybee at Work','Steel & Copper','Walnut & Brass','#2a3a42','#366478','#463329','#76512d'],
 veterans:['Blue Ridge Dawn','Redwood Grove','Navy & Brass','Evergreen & Stone','#23364d','#485e79','#2a4037','#4c6451'],
 birthday:['Birthday Bouquet','Candlelight','Amethyst & Pearl','Golden Occasion','#3d294f','#704787','#423321','#785528']
};
function editionPalette(c:Collection,first:SiteThemeDefinition,second:SiteThemeDefinition,index:number):ThemeTokens {
 const entry=editions[c.motif]!,source=(index%2===0?first:second).tokens;
 const rawNav=entry[index%2===0?4:6],rawAccent=entry[index%2===0?5:7];
 const nav=index<12?blend(rawNav,index===10?'#163d32':'#172e46',.34):rawNav;
 const accent=index<12?blend(rawAccent,index===10?'#2a634b':'#3b5a76',.44):rawAccent;
 const highlight=blend(source.highlight,'#fff2cc',.34);
 return {nav,accent,navEnd:blend(nav,'#07131b',.28),highlight,canvas:blend('#ffffff',highlight,.09),soft:blend('#ffffff',highlight,.24),softAlt:blend('#ffffff',source.softAlt,.72),line:blend('#b7c7c7',highlight,.29),surface:'#ffffff',ink:'#17212b',muted:'#3f4b57'};
}
const birthdayIds=['confetti','gold','balloons','cake','stars','garden','sky','coral','lavender','night','nature-study','nature-portrait','classic-primary','classic-alternate'];
// Theme names and IDs retain their history; copy describes the actual edition.
const emblems:Partial<Record<ThemeMotif,string>>={thanksgiving:'harvest',valentines:'valentine','black-history':'heritage',easter:'spring',halloween:'Halloween','new-year':'New Year',fall:'autumn',summer:'summer',spring:'garden',winter:'winter',mlk:'commemorative',memorial:'remembrance',juneteenth:'freedom',labor:'craft',veterans:'service',birthday:'birthday'};
function designMood(c:Collection,index:number){
 if(index%2===0||c.motif==='independence')return c.moods[index];
 if(c.motif==='christmas')return ({1:'Cranberry holly framed by fine metallic branches.',3:'A geometric gilded fir in an Art Deco fan.',5:'Engraved bells in a ribbed oval medallion.',7:'A crystal snowflake on a midnight star map.',9:'An ornament in an ivory letterpress frame.'} as Record<number,string>)[index];
 const emblem=emblems[c.motif]||'seasonal';
 return ({1:`Fine metallic branches frame the ${emblem} emblem.`,3:`A stepped Art Deco fan with ${emblem} inlay.`,5:`A ribbed oval medallion with a ${emblem} engraving.`,7:`A ${emblem} emblem on a midnight foil star map.`,9:`An ivory letterpress invitation with ${emblem} engraving and fine corner rules.`} as Record<number,string>)[index];
}
function buildCollection(c:Collection):SiteThemeDefinition[]{
 const originals=c.bases||originalSeasonalThemes.filter(t=>t.category===c.category);
 if(originals.length!==2)throw new Error(`Theme collection ${c.category} needs two palette anchors.`);
 const extension=editions[c.motif];if(!extension)throw new Error('Missing artwork editions: '+c.category);
 const extraIds=['nature-study','nature-portrait','classic-primary','classic-alternate'];
 return [...c.names,...extension.slice(0,4)].map((name,index)=>{
  const original=originals[index],tokens=index>9?editionPalette(c,originals[0],originals[1],index):original?.tokens||(c.motif==='christmas'?christmasPalette(index):paletteVariant(originals[0],originals[1],index));
  const id=c.personalOnly?`seasonal-birthday-${birthdayIds[index]}`:index>9?`seasonal-${c.slug}-${extraIds[index-10]}`:original?.id||`seasonal-${c.slug}-${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
  const colors=[tokens.nav,tokens.accent,tokens.highlight,tokens.soft,tokens.canvas];
  const style:ThemeArtStyle=index>11?'Classic Color':index>9?'Nature & Realistic':index%2===0?'Whimsical':'Elegant';
  const mood=index>11?'A color-only workspace with clear panels and no decorative artwork.':index>9?natureArt(c.motif,index+1).subject+'.':designMood(c,index);
  return {id,name,category:c.category,mood,seasonal:true,tokens,colors,...(c.personalOnly?{personalOnly:true}:{}),...(c.federalHoliday?{federalHoliday:c.federalHoliday}:{}),...(c.observanceNote?{observanceNote:c.observanceNote}:{}),decoration:{motif:c.motif,variant:index+1,style,layout:index>9?(['photograph','photo-study','solid','duotone'] as const)[index-10]:compositions[index],colors:c.motif==='christmas'?[tokens.highlight,'#d6283d','#147546','#fffaf0']:[tokens.highlight,blend(tokens.accent,'#ffffff',.45),blend(tokens.nav,'#ffffff',.66),tokens.soft],intensity:intensities[index]||'subtle'}};
 });
}
export const seasonalThemes:readonly SiteThemeDefinition[]=collections.flatMap(buildCollection);
export const birthdayThemes:readonly SiteThemeDefinition[]=seasonalThemes.filter(t=>t.personalOnly);

// Retired by company direction; not offered, published, or selectable.
// Keep exact IDs solely to migrate previously saved appearance preferences.
export const retiredThemeIds:ReadonlySet<string>=new Set([
 'seasonal-presidents-presidential-navy',
 'seasonal-presidents-federal-blue',
 'seasonal-presidents-union-stars',
 'seasonal-presidents-founding-ribbon',
 'seasonal-presidents-historic-frame',
 'seasonal-presidents-civic-bunting',
 'seasonal-presidents-presidential-constellation',
 'seasonal-presidents-capitol-dawn',
 'seasonal-presidents-laurel-liberty',
 'seasonal-presidents-classic-republic',
 'seasonal-october-observance-reflection',
 'seasonal-october-observance-land-community',
 'seasonal-october-observance-autumn-horizons',
 'seasonal-october-observance-shared-stories',
 'seasonal-october-observance-october-laurel',
 'seasonal-october-observance-living-landscapes',
 'seasonal-october-observance-guiding-horizons',
 'seasonal-october-observance-autumn-daybreak',
 'seasonal-october-observance-harvest-heritage',
 'seasonal-october-observance-thoughtful-october',
 'seasonal-inauguration-blue',
 'seasonal-inauguration-new-chapter',
 'seasonal-inauguration-civic-stars',
 'seasonal-inauguration-capitol-ribbon',
 'seasonal-inauguration-ceremonial-frame',
 'seasonal-inauguration-democracy-in-motion',
 'seasonal-inauguration-capitol-constellation',
 'seasonal-inauguration-inauguration-dawn',
 'seasonal-inauguration-laurel-union',
 'seasonal-inauguration-civic-reflection',
]);
