import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../dist/data/schools.json', import.meta.url);
const catalog = JSON.parse(readFileSync(target, 'utf8'));
const lines = value => value.trim().split('\n').map(line => line.trim()).filter(Boolean);
const slug = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const make = ({ code, region = code, group, name, englishName = name, aliases = [] }) => ({
  id: `${code.toLowerCase()}-${slug(englishName)}`,
  name,
  englishName,
  region,
  aliases,
  group,
  countryCode: code,
  mapRegionId: null,
  geoStatus: 'pending',
});
const makeEnglish = (code, group, names, aliasMap = {}) => lines(names).map(name => make({
  code,
  group,
  name,
  aliases: aliasMap[name] || [],
}));

const hongKong = [
  ['香港城市大学', 'City University of Hong Kong', ['CityU', '城大']],
  ['香港浸会大学', 'Hong Kong Baptist University', ['HKBU', '浸大']],
  ['岭南大学', 'Lingnan University', ['LU', '岭大']],
  ['香港中文大学', 'The Chinese University of Hong Kong', ['CUHK', '港中大', '中大']],
  ['香港教育大学', 'The Education University of Hong Kong', ['EdUHK', '教大']],
  ['香港理工大学', 'The Hong Kong Polytechnic University', ['PolyU', '港理工', '理大']],
  ['香港科技大学', 'The Hong Kong University of Science and Technology', ['HKUST', '港科大', '科大']],
  ['香港大学', 'The University of Hong Kong', ['HKU', '港大']],
].map(([name, englishName, aliases]) => make({ code: 'HK', group: '香港教资会资助大学', name, englishName, aliases }));

const singapore = [
  ['National University of Singapore', ['NUS', '新加坡国立大学', '新国大']],
  ['Nanyang Technological University', ['NTU', '南洋理工大学']],
  ['Singapore Management University', ['SMU', '新加坡管理大学']],
  ['Singapore University of Technology and Design', ['SUTD', '新加坡科技设计大学']],
  ['Singapore Institute of Technology', ['SIT', '新加坡理工大学']],
  ['Singapore University of Social Sciences', ['SUSS', '新加坡社科大学']],
  ['University of the Arts Singapore', ['UAS', '新加坡艺术大学']],
].map(([name, aliases]) => make({ code: 'SG', group: '新加坡政府支持大学', name, aliases }));

const unitedStates = makeEnglish('US', '美国AAU成员校', `
Arizona State University
Georgia Institute of Technology
Indiana University
Michigan State University
The Ohio State University
The Pennsylvania State University
Purdue University
Rutgers University – New Brunswick
Stony Brook University – The State University of New York
Texas A&M University
The University of Arizona
University at Buffalo – The State University of New York
University of California, Berkeley
University of California, Davis
University of California, Irvine
University of California, Los Angeles
University of California, Riverside
University of California, San Diego
University of California, Santa Barbara
University of California, Santa Cruz
University of Colorado, Boulder
University of Florida
University of Illinois Urbana-Champaign
The University of Iowa
The University of Kansas
University of Maryland at College Park
University of Michigan
University of Minnesota, Twin Cities
University of Missouri, Columbia
The University of North Carolina at Chapel Hill
University of Oregon
University of Pittsburgh
University of South Florida
The University of Texas at Austin
The University of Utah
University of Virginia
University of Washington
The University of Wisconsin – Madison
Boston University
Brandeis University
Brown University
California Institute of Technology
Carnegie Mellon University
Case Western Reserve University
Columbia University
Cornell University
Dartmouth
Duke University
Emory University
The George Washington University
Harvard University
The Johns Hopkins University
Massachusetts Institute of Technology
New York University
Northwestern University
Princeton University
Rice University
Stanford University
Tufts University
Tulane University
The University of Chicago
University of Miami
University of Notre Dame
University of Pennsylvania
University of Rochester
University of Southern California
Vanderbilt University
Washington University in St. Louis
Yale University
`, {
  'Arizona State University': ['ASU', '亚利桑那州立大学'],
  'Georgia Institute of Technology': ['Georgia Tech', 'GT', '佐治亚理工学院'],
  'The Ohio State University': ['Ohio State', 'OSU', '俄亥俄州立大学'],
  'The Pennsylvania State University': ['Penn State', 'PSU', '宾夕法尼亚州立大学'],
  'Texas A&M University': ['TAMU', '德州农工大学'],
  'University at Buffalo – The State University of New York': ['University at Buffalo', 'UB', 'SUNY Buffalo'],
  'University of California, Berkeley': ['UC Berkeley', 'UCB', '加州大学伯克利分校'],
  'University of California, Davis': ['UC Davis', 'UCD', '加州大学戴维斯分校'],
  'University of California, Irvine': ['UC Irvine', 'UCI', '加州大学欧文分校'],
  'University of California, Los Angeles': ['UCLA', '加州大学洛杉矶分校'],
  'University of California, Riverside': ['UC Riverside', 'UCR'],
  'University of California, San Diego': ['UC San Diego', 'UCSD', '加州大学圣迭戈分校'],
  'University of California, Santa Barbara': ['UC Santa Barbara', 'UCSB'],
  'University of California, Santa Cruz': ['UC Santa Cruz', 'UCSC'],
  'University of Illinois Urbana-Champaign': ['UIUC', '伊利诺伊大学厄巴纳-香槟分校'],
  'University of Maryland at College Park': ['UMD', 'University of Maryland'],
  'The University of North Carolina at Chapel Hill': ['UNC', 'UNC Chapel Hill', '北卡罗来纳大学教堂山分校'],
  'The University of Texas at Austin': ['UT Austin', 'UTA', '德克萨斯大学奥斯汀分校'],
  'The University of Wisconsin – Madison': ['UW–Madison', 'UW Madison', '威斯康星大学麦迪逊分校'],
  'California Institute of Technology': ['Caltech', '加州理工学院'],
  'Carnegie Mellon University': ['CMU', '卡内基梅隆大学'],
  'Columbia University': ['哥伦比亚大学'],
  'Dartmouth': ['Dartmouth College', '达特茅斯学院'],
  'The Johns Hopkins University': ['Johns Hopkins University', 'JHU', '约翰斯·霍普金斯大学'],
  'Massachusetts Institute of Technology': ['MIT', '麻省理工学院'],
  'New York University': ['NYU', '纽约大学'],
  'University of Pennsylvania': ['UPenn', 'Penn', '宾夕法尼亚大学'],
  'University of Southern California': ['USC', '南加州大学'],
  'Washington University in St. Louis': ['WashU', '圣路易斯华盛顿大学'],
});

const canada = makeEnglish('CA', 'Universities Canada成员校', `
Athabasca University
Concordia University of Edmonton
King’s University (The)
MacEwan University
Mount Royal University
St. Mary’s University
University of Alberta
University of Calgary
University of Lethbridge
Capilano University
Emily Carr University of Art + Design
Kwantlen Polytechnic University
Royal Roads University
Simon Fraser University
Thompson Rivers University
Trinity Western University
University of British Columbia (The)
University of Northern British Columbia
University of the Fraser Valley
University of Victoria
Vancouver Island University
Brandon University
Canadian Mennonite University
St. Paul’s College
Université de Saint-Boniface
University of Manitoba
University of Winnipeg (The)
Mount Allison University
St. Thomas University
Université de Moncton
University of New Brunswick
Memorial University of Newfoundland and Labrador
Acadia University
Cape Breton University
Dalhousie University
Mount Saint Vincent University
NSCAD University
Saint Mary’s University
St. Francis Xavier University
Université Sainte-Anne
University of King’s College
Algoma University
Brock University
Carleton University
Huron University College
King’s University College at Western University
Lakehead University
Laurentian University
McMaster University
Nipissing University
OCAD University
Ontario Tech University
Queen’s University
Redeemer University
Royal Military College of Canada
St. Jerome’s University
Toronto Metropolitan University
Trent University
University of Guelph
University of Ottawa
University of St. Michael’s College
University of Sudbury
University of Toronto
University of Trinity College
University of Waterloo
University of Windsor
Victoria University
Western University
Wilfrid Laurier University
York University
University of Prince Edward Island
Bishop’s University
Concordia University
École de technologie supérieure
École nationale d’administration publique
HEC Montréal
Institut national de la recherche scientifique
McGill University
Polytechnique Montréal
Université de Montréal
Université de Sherbrooke
Université du Québec
Université du Québec à Chicoutimi (UQAC)
Université du Québec à Montréal (UQAM)
Université du Québec à Rimouski (UQAR)
Université du Québec à Trois-Rivières (UQTR)
Université du Québec en Abitibi-Témiscamingue (UQAT)
Université du Québec en Outaouais
Université Laval
Université TÉLUQ
Campion College
First Nations University of Canada
Luther College
St. Thomas More College
University of Regina
University of Saskatchewan
Yukon University
`, {
  'Simon Fraser University': ['SFU', '西蒙菲莎大学'],
  'University of British Columbia (The)': ['University of British Columbia', 'UBC', '英属哥伦比亚大学'],
  'McMaster University': ['McMaster', '麦克马斯特大学'],
  'Queen’s University': ["Queen's University", 'Queens University', '女王大学'],
  'Toronto Metropolitan University': ['TMU', '多伦多都会大学', 'Ryerson University'],
  'University of Toronto': ['U of T', 'UofT', '多伦多大学'],
  'University of Waterloo': ['Waterloo', '滑铁卢大学'],
  'Western University': ['University of Western Ontario', 'UWO', '西安大略大学'],
  'McGill University': ['McGill', '麦吉尔大学'],
});

const japanPairs = `
北海道大学|Hokkaido University|北大
北海道教育大学|Hokkaido University of Education|
室兰工业大学|Muroran Institute of Technology|
小樽商科大学|Otaru University of Commerce|
带广畜产大学|Obihiro University of Agriculture and Veterinary Medicine|
北见工业大学|Kitami Institute of Technology|
旭川医科大学|Asahikawa Medical University|
弘前大学|Hirosaki University|
岩手大学|Iwate University|
东北大学|Tohoku University|
宫城教育大学|Miyagi University of Education|
秋田大学|Akita University|
山形大学|Yamagata University|
福岛大学|Fukushima University|
东京大学|The University of Tokyo|东大
东京外国语大学|Tokyo University of Foreign Studies|TUFS
东京科学大学|Institute of Science Tokyo|Science Tokyo,东京工业大学,东京医科齿科大学
东京学艺大学|Tokyo Gakugei University|
东京农工大学|Tokyo University of Agriculture and Technology|TUAT
东京艺术大学|Tokyo University of the Arts|东京艺大
东京海洋大学|Tokyo University of Marine Science and Technology|TUMSAT
御茶水女子大学|Ochanomizu University|
电气通信大学|The University of Electro-Communications|UEC
一桥大学|Hitotsubashi University|
政策研究大学院大学|National Graduate Institute for Policy Studies|GRIPS
茨城大学|Ibaraki University|
筑波大学|University of Tsukuba|
筑波技术大学|Tsukuba University of Technology|
宇都宫大学|Utsunomiya University|
群马大学|Gunma University|
埼玉大学|Saitama University|
千叶大学|Chiba University|
横滨国立大学|Yokohama National University|YNU
综合研究大学院大学|The Graduate University for Advanced Studies, SOKENDAI|SOKENDAI
新潟大学|Niigata University|
长冈技术科学大学|Nagaoka University of Technology|
上越教育大学|Joetsu University of Education|
山梨大学|University of Yamanashi|
信州大学|Shinshu University|
富山大学|University of Toyama|
金泽大学|Kanazawa University|
北陆先端科学技术大学院大学|Japan Advanced Institute of Science and Technology|JAIST
福井大学|University of Fukui|
静冈大学|Shizuoka University|
滨松医科大学|Hamamatsu University School of Medicine|
岐阜大学|Gifu University|
名古屋大学|Nagoya University|名大
爱知教育大学|Aichi University of Education|
名古屋工业大学|Nagoya Institute of Technology|名工大
丰桥技术科学大学|Toyohashi University of Technology|
三重大学|Mie University|
滋贺大学|Shiga University|
滋贺医科大学|Shiga University of Medical Science|
京都大学|Kyoto University|京大
京都教育大学|Kyoto University of Education|
京都工艺纤维大学|Kyoto Institute of Technology|
大阪大学|The University of Osaka|Osaka University,阪大
大阪教育大学|Osaka Kyoiku University|
兵库教育大学|Hyogo University of Teacher Education|
神户大学|Kobe University|
奈良教育大学|Nara University of Education|
奈良女子大学|Nara Women’s University|
奈良先端科学技术大学院大学|Nara Institute of Science and Technology|NAIST
和歌山大学|Wakayama University|
鸟取大学|Tottori University|
岛根大学|Shimane University|
冈山大学|Okayama University|
广岛大学|Hiroshima University|
山口大学|Yamaguchi University|
德岛大学|Tokushima University|
鸣门教育大学|Naruto University of Education|
香川大学|Kagawa University|
爱媛大学|Ehime University|
高知大学|Kochi University|
福冈教育大学|University of Teacher Education Fukuoka|
九州大学|Kyushu University|九大
九州工业大学|Kyushu Institute of Technology|Kyutech
佐贺大学|Saga University|
长崎大学|Nagasaki University|
熊本大学|Kumamoto University|
大分大学|Oita University|
宫崎大学|University of Miyazaki|
鹿儿岛大学|Kagoshima University|
鹿屋体育大学|National Institute of Fitness and Sports in Kanoya|NIFS
琉球大学|University of the Ryukyus|
`;
const japan = lines(japanPairs).map(row => {
  const [name, englishName, aliasText] = row.split('|');
  return make({ code: 'JP', group: '日本国立大学协会成员校', name, englishName, aliases: aliasText ? aliasText.split(',') : [] });
});

const australia = makeEnglish('AU', 'Universities Australia成员校', `
The Australian National University
University of Canberra
Australian Catholic University
The University of Notre Dame Australia
Charles Sturt University
Macquarie University
Southern Cross University
The University of New England
The University of Newcastle
The University of Sydney
University of Technology Sydney
University of Wollongong
UNSW
Western Sydney University
Charles Darwin University
Bond University
CQUniversity Australia
Griffith University
James Cook University
Queensland University of Technology
The University of Queensland
University of Southern Queensland
University of the Sunshine Coast
Adelaide University
Flinders University
University of Tasmania
Deakin University
Federation University Australia
La Trobe University
Monash University
RMIT University
Swinburne University of Technology
The University of Melbourne
Victoria University
Curtin University
Edith Cowan University
Murdoch University
The University of Western Australia
`, {
  'The Australian National University': ['Australian National University', 'ANU', '澳大利亚国立大学'],
  'The University of Sydney': ['University of Sydney', 'USYD', '悉尼大学'],
  'University of Technology Sydney': ['UTS', '悉尼科技大学'],
  'UNSW': ['University of New South Wales', '新南威尔士大学'],
  'Queensland University of Technology': ['QUT', '昆士兰科技大学'],
  'The University of Queensland': ['University of Queensland', 'UQ', '昆士兰大学'],
  'Adelaide University': ['University of Adelaide', 'University of South Australia', '阿德莱德大学'],
  'Monash University': ['莫纳什大学'],
  'RMIT University': ['RMIT', '皇家墨尔本理工大学'],
  'The University of Melbourne': ['University of Melbourne', 'UniMelb', '墨尔本大学'],
  'The University of Western Australia': ['University of Western Australia', 'UWA', '西澳大学'],
});

const additions = [...hongKong, ...singapore, ...unitedStates, ...canada, ...japan, ...australia];
const newCodes = new Set(['HK', 'SG', 'US', 'CA', 'JP', 'AU']);
catalog.schools = catalog.schools.filter(school => !newCodes.has(school.countryCode)).concat(additions);
catalog.updatedAt = '2026-10-24';
catalog.coverage = '中国原211名单；英国Universities UK成员；中国香港教资会资助大学；新加坡6所自治大学及政府支持的UAS；美国AAU美国成员；加拿大Universities Canada成员；日本国立大学协会成员；澳大利亚Universities Australia成员。均为有明确边界的首批名单，并非各地全部高校。';
catalog.sources = [
  { title: '教育部原211学校名单', url: 'https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html' },
  { title: 'Universities UK members', url: 'https://www.universitiesuk.ac.uk/about-us/our-members' },
  { title: '香港教资会资助大学', url: 'https://www.ugc.edu.hk/eng/ugc/site/fund_inst.html' },
  { title: 'Singapore MOE post-secondary institutions', url: 'https://www.moe.gov.sg/post-secondary/overview' },
  { title: 'AAU Member Universities', url: 'https://www.aau.edu/resource-library/aau-member-universities-by-year-of-entry' },
  { title: 'Universities Canada members', url: 'https://univcan.ca/about-universities-canada/our-members/' },
  { title: '日本国立大学协会会员名册', url: 'https://www.janu.jp/janu/about/' },
  { title: 'Universities Australia members', url: 'https://universitiesaustralia.edu.au/our-universities/' },
];
catalog.countries = { CN: '中国', HK: '中国香港', SG: '新加坡', US: '美国', CA: '加拿大', JP: '日本', AU: '澳大利亚', GB: '英国' };

const ids = additions.map(school => school.id);
if (new Set(ids).size !== ids.length) throw new Error('Generated school IDs are not unique');
writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Added ${additions.length} schools; directory now contains ${catalog.schools.length}.`);
