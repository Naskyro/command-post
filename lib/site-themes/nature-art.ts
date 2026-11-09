/** Original photographic-style artwork. Files are bundled locally: no external
 * image service, remote URL, third-party cookies, or per-visitor image generation. */
export type NaturePhoto = {src:string;subject:string;position:string};
type Entry = readonly [stem:string,subject:string,position:string];
const photographs:Record<string,readonly [Entry,Entry]>={
  christmas:[['frosted-evergreen','Frost-tipped evergreen needles and a pine cone','50% 48%'],['winter-holly','Scarlet holly berries and evergreen leaves','50% 48%']],
  thanksgiving:[['harvest-gourds','Autumn gourds and golden corn','50% 56%'],['golden-wheat','Ripe golden wheat against the sky','50% 48%']],
  valentines:[['crimson-rose','A deep crimson rose with morning dew','50% 46%'],['blush-peonies','Soft pink peonies on white linen','50% 52%']],
  independence:[['fireworks-over-water','Fireworks reflected in a lake','50% 46%'],['prairie-fireflies','Summer fireflies above prairie grasses','50% 54%']],
  'black-history':[['southern-live-oak','A sunlit live oak draped in Spanish moss','50% 47%'],['magnolia-bloom','Cream magnolia blooming among green leaves','50% 50%']],
  easter:[['easter-lilies','White lilies in a spring garden','50% 48%'],['robins-nest','Pale blue eggs resting in a nest','50% 55%']],
  halloween:[['lantern-at-dusk','A glowing jack-o’-lantern at dusk','50% 53%'],['moonlit-branches','A crescent moon and bare branches','50% 47%']],
  'new-year':[['first-light','Sunrise above a sea of clouds','50% 49%'],['midnight-sparklers','Silver and gold sparklers in the night','50% 46%']],
  fall:[['scarlet-canopy','Sunlight through scarlet maple leaves','50% 50%'],['autumn-creek','Amber leaves on a still creek','50% 54%']],
  summer:[['summer-surf','Turquoise surf on a sandy shore','50% 54%'],['sunflower-field','Golden sunflowers beneath a blue sky','50% 50%']],
  spring:[['wildflower-meadow','Purple and yellow meadow wildflowers','50% 54%'],['cherry-blossom','Pink cherry blossoms on a branch','50% 49%']],
  winter:[['alpine-lake','A frozen alpine lake and snowy ridgeline','50% 52%'],['snowy-birches','White birch trunks in a snowy forest','50% 50%']],
  mlk:[['dove-of-peace','A white dove on a branch','50% 47%'],['reflecting-pool','Trees reflected in a still pool at dawn','50% 50%']],
  memorial:[['remembrance-poppies','Red poppies in morning light','50% 49%'],['white-lily','A white lily beside a weathered stone','50% 55%']],
  juneteenth:[['gulf-coast-sunrise','Gentle Gulf Coast waves at sunrise','50% 50%'],['coastal-hibiscus','A deep red hibiscus in coastal light','50% 50%']],
  labor:[['field-rows','Orderly green farm rows in sunlight','50% 54%'],['honeybee-at-work','A honeybee at work on golden comb','50% 53%']],
  veterans:[['blue-ridge-dawn','Dawn above misty blue mountain ridges','50% 50%'],['redwood-grove','Sunlight between tall redwood trunks','50% 48%']],
  birthday:[['birthday-bouquet','A fresh bouquet of dahlias and roses','50% 50%'],['candlelight','A birthday candle on a small cream cake','50% 52%']],
};
export function natureArt(motif:string,variant:number):NaturePhoto{
  const pair=photographs[motif];
  if(!pair||(variant!==11&&variant!==12))throw new Error('Unknown Nature & Realistic theme: '+motif+'/'+variant);
  const [stem,subject,position]=pair[variant===12?1:0];
  return {src:'/theme-photography/'+stem+'.webp',subject,position};
}
