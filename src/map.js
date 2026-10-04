// Classic 42-territory world map. Coordinates are for a 1000x620 SVG viewBox.

export const CONTINENTS = {
  north_america: { name: 'North America', bonus: 5, color: '#d9b84a' },
  south_america: { name: 'South America', bonus: 2, color: '#c8643c' },
  europe: { name: 'Europe', bonus: 5, color: '#4f7cc4' },
  africa: { name: 'Africa', bonus: 3, color: '#a0703c' },
  asia: { name: 'Asia', bonus: 7, color: '#4f9a5a' },
  australia: { name: 'Australia', bonus: 2, color: '#9a5ab0' },
};

const T = (name, continent, x, y) => ({ name, continent, x, y });

export const TERRITORIES = {
  alaska: T('Alaska', 'north_america', 60, 95),
  northwest_territory: T('Northwest Territory', 'north_america', 165, 90),
  greenland: T('Greenland', 'north_america', 335, 50),
  alberta: T('Alberta', 'north_america', 135, 155),
  ontario: T('Ontario', 'north_america', 215, 160),
  quebec: T('Quebec', 'north_america', 295, 150),
  western_us: T('Western US', 'north_america', 140, 230),
  eastern_us: T('Eastern US', 'north_america', 235, 235),
  central_america: T('Central America', 'north_america', 170, 305),

  venezuela: T('Venezuela', 'south_america', 245, 355),
  peru: T('Peru', 'south_america', 235, 440),
  brazil: T('Brazil', 'south_america', 315, 410),
  argentina: T('Argentina', 'south_america', 265, 520),

  iceland: T('Iceland', 'europe', 420, 95),
  scandinavia: T('Scandinavia', 'europe', 510, 85),
  great_britain: T('Great Britain', 'europe', 415, 170),
  northern_europe: T('Northern Europe', 'europe', 500, 175),
  western_europe: T('Western Europe', 'europe', 435, 250),
  southern_europe: T('Southern Europe', 'europe', 520, 245),
  ukraine: T('Ukraine', 'europe', 590, 145),

  north_africa: T('North Africa', 'africa', 465, 345),
  egypt: T('Egypt', 'africa', 555, 320),
  east_africa: T('East Africa', 'africa', 610, 405),
  congo: T('Congo', 'africa', 535, 430),
  south_africa: T('South Africa', 'africa', 555, 520),
  madagascar: T('Madagascar', 'africa', 650, 505),

  ural: T('Ural', 'asia', 680, 125),
  siberia: T('Siberia', 'asia', 750, 85),
  yakutsk: T('Yakutsk', 'asia', 835, 60),
  kamchatka: T('Kamchatka', 'asia', 925, 75),
  irkutsk: T('Irkutsk', 'asia', 820, 140),
  mongolia: T('Mongolia', 'asia', 840, 205),
  japan: T('Japan', 'asia', 940, 210),
  afghanistan: T('Afghanistan', 'asia', 665, 220),
  china: T('China', 'asia', 770, 265),
  middle_east: T('Middle East', 'asia', 625, 300),
  india: T('India', 'asia', 705, 330),
  siam: T('Siam', 'asia', 795, 345),

  indonesia: T('Indonesia', 'australia', 805, 435),
  new_guinea: T('New Guinea', 'australia', 905, 420),
  western_australia: T('Western Australia', 'australia', 845, 525),
  eastern_australia: T('Eastern Australia', 'australia', 935, 515),
};

const EDGES = [
  ['alaska', 'northwest_territory'], ['alaska', 'alberta'], ['alaska', 'kamchatka'],
  ['northwest_territory', 'alberta'], ['northwest_territory', 'ontario'], ['northwest_territory', 'greenland'],
  ['greenland', 'ontario'], ['greenland', 'quebec'], ['greenland', 'iceland'],
  ['alberta', 'ontario'], ['alberta', 'western_us'],
  ['ontario', 'quebec'], ['ontario', 'western_us'], ['ontario', 'eastern_us'],
  ['quebec', 'eastern_us'],
  ['western_us', 'eastern_us'], ['western_us', 'central_america'],
  ['eastern_us', 'central_america'],
  ['central_america', 'venezuela'],
  ['venezuela', 'peru'], ['venezuela', 'brazil'],
  ['peru', 'brazil'], ['peru', 'argentina'],
  ['brazil', 'argentina'], ['brazil', 'north_africa'],
  ['north_africa', 'egypt'], ['north_africa', 'east_africa'], ['north_africa', 'congo'],
  ['north_africa', 'western_europe'], ['north_africa', 'southern_europe'],
  ['egypt', 'east_africa'], ['egypt', 'southern_europe'], ['egypt', 'middle_east'],
  ['east_africa', 'congo'], ['east_africa', 'south_africa'], ['east_africa', 'madagascar'], ['east_africa', 'middle_east'],
  ['congo', 'south_africa'],
  ['south_africa', 'madagascar'],
  ['iceland', 'great_britain'], ['iceland', 'scandinavia'],
  ['great_britain', 'scandinavia'], ['great_britain', 'northern_europe'], ['great_britain', 'western_europe'],
  ['scandinavia', 'northern_europe'], ['scandinavia', 'ukraine'],
  ['northern_europe', 'western_europe'], ['northern_europe', 'southern_europe'], ['northern_europe', 'ukraine'],
  ['western_europe', 'southern_europe'],
  ['southern_europe', 'ukraine'], ['southern_europe', 'middle_east'],
  ['ukraine', 'ural'], ['ukraine', 'afghanistan'], ['ukraine', 'middle_east'],
  ['ural', 'siberia'], ['ural', 'china'], ['ural', 'afghanistan'],
  ['siberia', 'yakutsk'], ['siberia', 'irkutsk'], ['siberia', 'mongolia'], ['siberia', 'china'],
  ['yakutsk', 'kamchatka'], ['yakutsk', 'irkutsk'],
  ['kamchatka', 'irkutsk'], ['kamchatka', 'mongolia'], ['kamchatka', 'japan'],
  ['irkutsk', 'mongolia'],
  ['mongolia', 'china'], ['mongolia', 'japan'],
  ['afghanistan', 'china'], ['afghanistan', 'india'], ['afghanistan', 'middle_east'],
  ['china', 'india'], ['china', 'siam'],
  ['middle_east', 'india'],
  ['india', 'siam'],
  ['siam', 'indonesia'],
  ['indonesia', 'new_guinea'], ['indonesia', 'western_australia'],
  ['new_guinea', 'western_australia'], ['new_guinea', 'eastern_australia'],
  ['western_australia', 'eastern_australia'],
];

export const ADJ = Object.fromEntries(Object.keys(TERRITORIES).map((t) => [t, []]));
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
export { EDGES };

export const TERRITORY_IDS = Object.keys(TERRITORIES);

export const CONTINENT_TERRITORIES = Object.fromEntries(
  Object.keys(CONTINENTS).map((c) => [c, TERRITORY_IDS.filter((t) => TERRITORIES[t].continent === c)]),
);
