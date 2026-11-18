/**
 * The moods in Czech: each mood's `label`, `title` and `description` from
 * `moods.ts`, keyed by slug. Only the words – the queries behind them are the
 * same in both languages. `localizeMood` reads this; a slug missing here keeps
 * its English words.
 *
 * Written for Czech readers rather than translated word for word: a title is
 * what someone would type into a search engine ("filmy o loupežích", "nejlepší
 * filmy 90. let"), and a description is a sentence a person would say.
 *
 * A title is a plural noun phrase with no clause of its own: a platform landing
 * builds on it – "… na Netflix", "…, které teď běží na Netflix" – and a title
 * that already ended in "které" would read twice. Each title lists what the
 * English one does: films only, series only, or both.
 */

import type { MoodGroup } from "./moods";

export const MOOD_GROUP_HEADINGS_CS: Record<MoodGroup, string> = {
  feeling: "Jak se chcete cítit",
  time: "Kolik máte času",
  story: "O čem to má být",
  season: "Roční období",
  world: "Odkud to je",
  era: "Kdy to vzniklo",
};

export const MOOD_TEXT_CS: Record<
  string,
  { label: string; title: string; description: string }
> = {
  "easy-watch": {
    label: "Něco nenáročného",
    title: "Filmy a seriály pro dobrou náladu",
    description:
      "Pohodové, laskavé a nenáročné. Na večer po dni, který si od vás vzal až dost.",
  },
  "mind-bending": {
    label: "Na zamotání hlavy",
    title: "Filmy na přemýšlení",
    description:
      "Filmy, které se zamotávají samy do sebe. Věnujte jim plnou pozornost – budete ji potřebovat.",
  },
  "under-90-minutes": {
    label: "Do 90 minut",
    title: "Skvělé filmy do 90 minut",
    description:
      "Dobré filmy, které vám nezaberou celý večer. Všechno tady skončí do hodiny a půl.",
  },
  "edge-of-your-seat": {
    label: "Jako na trní",
    title: "Nejlepší thrillery a napínavé seriály",
    description:
      "Thrillery, které utahují šrouby čím dál víc. Na chvíle, kdy vás má příběh spíš držet v napětí než dojímat.",
  },
  "have-a-cry": {
    label: "Pořádně si pobrečet",
    title: "Smutné filmy na brečení",
    description:
      "Dramata, která si slzy poctivě zaslouží. Filmy, které si lidé pamatují podle toho, jak se cítili na konci.",
  },
  "laugh-out-loud": {
    label: "Opravdu vtipné",
    title: "Nejvtipnější komedie – filmy i seriály",
    description:
      "Komedie, které obstojí i napodruhé. Hodnotilo je tolik lidí, že smích není náhoda.",
  },
  "lights-off": {
    label: "Zhasnout světla",
    title: "Nejlepší horory",
    description:
      "Horory, kvůli kterým se vyplatí zhasnout. Žádná béčka ze dna žánru.",
  },
  "true-story": {
    label: "Podle skutečných událostí",
    title: "Nejlepší filmy podle skutečných událostí",
    description:
      "Opravdu se to stalo. Životopisy, historie a filmy postavené na skutečných událostech.",
  },
  "big-and-loud": {
    label: "Pořádná podívaná",
    title: "Nejlepší akční a dobrodružné filmy",
    description:
      "Velkolepá podívaná. Přesně to, kvůli čemu se vyplatí pustit dobré reproduktory a velkou obrazovku.",
  },
  "date-night": {
    label: "Večer ve dvou",
    title: "Nejlepší romantické komedie",
    description:
      "Romantické komedie, které jsou opravdu obojí – a to je vzácnější, než se zdá. Klidně je pusťte s někým, kdo se vám líbí.",
  },
  "family-movie-night": {
    label: "Rodinný filmový večer",
    title: "Nejlepší rodinné filmy a seriály",
    description:
      "Filmy, u kterých děti vydrží sedět a dospělí se nebudou nudit. Hodnotilo je dost lidí, abyste jim mohli věřit.",
  },
  "dark-comedy": {
    label: "Smích na nepravém místě",
    title: "Nejlepší černé komedie",
    description:
      "Komedie s mrtvolami, nebo aspoň s nečistým svědomím. Na chvíle, kdy obyčejná veselost nestačí.",
  },
  "hidden-gems": {
    label: "Něco, co jste ještě neviděli",
    title: "Skryté klenoty: nedoceněné filmy a seriály",
    description:
      "Vysoko hodnocené, a přesto skoro neviděné. Dobré filmy a seriály bez velké reklamy, všechny aspoň pár let staré.",
  },
  "long-epics": {
    label: "Na celý večer",
    title: "Epické filmy delší než 3 hodiny",
    description:
      "Tři hodiny a víc a každá minuta stojí za to. Uvolněte si celý večer a varujte ostatní doma.",
  },
  "limited-series": {
    label: "Na jeden víkend",
    title: "Nejlepší minisérie a uzavřené seriály",
    description:
      "Seriály, které mají konec už napsaný. Jedna řada, žádný otevřený konec, žádný závazek na osm let.",
  },
  heist: {
    label: "Poslední kšeft",
    title: "Nejlepší filmy o loupežích",
    description:
      "Plán, parta a chvíle, kdy se všechno pokazí. Loupeže a bankovní přepadení se zradou, která přijde přesně včas.",
  },
  "time-travel": {
    label: "Tam a zpátky v čase",
    title: "Nejlepší filmy a seriály o cestování v čase",
    description:
      "Stroje času, časové smyčky a paradoxy, které k nim patří. Některé dávají smysl dokonce i po titulcích.",
  },
  space: {
    label: "Tam venku",
    title: "Nejlepší filmy a seriály o vesmíru",
    description:
      "Astronauti, mise a dlouhá tma mezi hvězdami. Vesmír jako místo, kam lidé opravdu letí.",
  },
  dystopia: {
    label: "Budoucnost se nepovedla",
    title: "Nejlepší dystopické filmy a seriály",
    description:
      "Zhroucené společnosti a to, co po nich zbylo. Ponuré, ale dobře natočené budoucnosti pro chvíle, kdy je vám v přítomnosti až moc dobře.",
  },
  zombies: {
    label: "Mrtví vstávají",
    title: "Nejlepší zombie filmy a seriály",
    description:
      "Nákazy, barikády a pomalé zjištění, co se stalo se sousedy. Nemrtví v nejlepší formě.",
  },
  vampires: {
    label: "Po setmění, se špičáky",
    title: "Nejlepší upíří filmy a seriály",
    description:
      "Hrabata, upíří klany a občas i sdílený byt. Upíři hrůzostrašní, romantičtí i k popukání.",
  },
  superheroes: {
    label: "Plášť na ramena",
    title: "Nejlepší superhrdinské filmy a seriály",
    description:
      "Pláště, masky a příběhy o tom, jak to všechno začalo – ty, které obstojí, i když triky dávno zestárly.",
  },
  spies: {
    label: "Nikomu nevěřte",
    title: "Nejlepší špionážní filmy",
    description:
      "Dvojití agenti, mrtvé schránky a lidé, kteří nejsou tím, za koho se vydávali. Špionáž od studené války po éru vychytávek.",
  },
  "serial-killers": {
    label: "Dopadnout vraha",
    title: "Nejlepší filmy a seriály o sériových vrazích",
    description:
      "Hon, profil pachatele a špatný podezřelý. Temné kriminální příběhy o lidech, kteří vraždí znovu a znovu.",
  },
  whodunit: {
    label: "Kdo je vrah?",
    title: "Nejlepší detektivní filmy",
    description:
      "Mrtvola, dům plný podezřelých a jeden člověk, který už to rozlouskl. Detektivky, které můžete zkusit vyřešit dřív než on.",
  },
  "coming-of-age": {
    label: "Dospívání",
    title: "Nejlepší filmy a seriály o dospívání",
    description:
      "První brigády, první lásky, poslední prázdniny. Příběhy o roce, kdy se všechno změnilo.",
  },
  "road-trip": {
    label: "Na cestě",
    title: "Nejlepší filmy typu road movie",
    description:
      "Dva lidé, jedno auto a cíl, o který nakonec vůbec nejde.",
  },
  revenge: {
    label: "Odplata",
    title: "Nejlepší filmy o pomstě",
    description:
      "Někdo utrpěl křivdu a měl dost času o ní přemýšlet. Pomsta podávaná při jakékoli teplotě.",
  },
  survival: {
    label: "Navzdory všemu",
    title: "Nejlepší filmy o přežití",
    description:
      "Ztroskotaní, pronásledovaní, nebo jim je prostě hrozná zima. Lidé, kterým zbyl jediný úkol: přežít.",
  },
  sports: {
    label: "Outsideři",
    title: "Nejlepší sportovní filmy",
    description:
      "Tréninkové sekvence, poslední kola a tým, kterému nikdo nevěřil. Ten sport vás přitom bavit nemusí.",
  },
  musicals: {
    label: "Najednou se zpívá",
    title: "Nejlepší filmové muzikály",
    description:
      "Filmy, ve kterých jsou city příliš velké na obyčejný dialog. Klasika z divadla, animované stálice i pár překvapení.",
  },
  anime: {
    label: "Večer s anime",
    title: "Nejlepší anime filmy a seriály",
    description:
      "Filmy a seriály japonských animačních studií: ty, které lidé doporučují jako první, i ty, na které dojde hned potom.",
  },
  mafia: {
    label: "Rodinný podnik",
    title: "Nejlepší mafiánské a gangsterské filmy a seriály",
    description:
      "Mafiáni, zločinecké rodiny a cena věrnosti. Podsvětí od pouličních kšeftů až po stůl, u kterého se rozhoduje.",
  },
  "true-crime": {
    label: "Skutečné zločiny",
    title: "Nejlepší true crime seriály",
    description:
      "Skutečné případy, skutečná vyšetřování a dramata, která se jich drží. Těžko se od nich odtrhnete a ještě hůř na ně zapomenete.",
  },
  documentaries: {
    label: "Dozvědět se něco nového",
    title: "Nejlepší dokumenty",
    description:
      "Skuteční lidé, skutečná místa, žádný scénář. Dokumenty, po kterých budete ještě dlouho něco dohledávat.",
  },
  war: {
    label: "V zákopech",
    title: "Nejlepší válečné filmy a seriály",
    description:
      "Boje, okupace a lidé, kteří se ocitli mezi nimi. Válečné příběhy, které jsou o víc než jen o bojích.",
  },
  "world-war-2": {
    label: "1939–1945",
    title: "Nejlepší filmy o druhé světové válce",
    description:
      "Druhá světová válka na plátně: fronty, tábory, odboj i život v zázemí.",
  },
  westerns: {
    label: "V pravé poledne",
    title: "Nejlepší westerny",
    description:
      "Prach, dluhy a cizinec, který přijíždí do města. Klasické westerny, spaghetti westerny i ty moderní.",
  },
  "artificial-intelligence": {
    label: "Stroje přemýšlejí",
    title: "Nejlepší filmy o umělé inteligenci",
    description:
      "Roboti, androidi a programy s vlastní hlavou. Příběhy o umělé inteligenci z doby, kdy o ní ještě nepsaly zprávy.",
  },
  aliens: {
    label: "Nejsme sami",
    title: "Nejlepší filmy a seriály o mimozemšťanech",
    description:
      "První kontakt, invaze a věci nalezené v ledu. Návštěvníci přátelští i velmi, velmi nepřátelští.",
  },
  "supernatural-horror": {
    label: "Něco je v domě",
    title: "Nejlepší nadpřirozené horory",
    description:
      "Strašidelné domy, posedlost a dveře, které měly zůstat zavřené. Hrůza, se kterou se nedá rozumně domluvit.",
  },
  slashers: {
    label: "Nechoďte nahoru",
    title: "Nejlepší slashery",
    description:
      "Maska, čepel a parta, která se pořád rozděluje. Klasiky žánru i filmy, které se od nich učily.",
  },
  "psychological-thrillers": {
    label: "V hlavě",
    title: "Nejlepší psychologické thrillery",
    description:
      "Nespolehliví vypravěči, posedlost a pomalé rozpadání. Thrillery, ve kterých je nebezpečné to, čemu někdo věří.",
  },
  "neo-noir": {
    label: "Déšť a neony",
    title: "Nejlepší neo-noir filmy",
    description:
      "Noční ulice, zkorumpovaní detektivové a obchody, které se zvrtnou. Noir po skončení černobílé éry.",
  },
  "based-on-books": {
    label: "Nejdřív kniha",
    title: "Nejlepší filmy a seriály podle knih",
    description:
      "Adaptace, které knize dostály, nebo ji dokonce překonaly. Romány, paměti i občasná fantasy tlustá jako cihla.",
  },
  "stand-up": {
    label: "Jeden mikrofon",
    title: "Nejlepší stand-up comedy vystoupení",
    description:
      "Jeden člověk, jeden mikrofon, hodina. Vystoupení, která lidé citují dodnes.",
  },
  prison: {
    label: "Za mřížemi",
    title: "Nejlepší vězeňské filmy",
    description:
      "Život za zdmi věznice a plány, jak se dostat ven. Útěky, nespravedlivé rozsudky a dlouhé čekání.",
  },
  lgbtq: {
    label: "Queer příběhy",
    title: "Nejlepší LGBTQ+ filmy a seriály",
    description:
      "Milostné příběhy, příběhy o coming outu i příběhy, ve kterých je to prostě součást toho, kým postavy jsou.",
  },
  christmas: {
    label: "Vánoce",
    title: "Nejlepší vánoční filmy",
    description:
      "Sníh, usmiřování a jeden dva filmy, které se jen náhodou odehrávají v prosinci. Ty, které stojí za to vidět každý rok znovu.",
  },
  halloween: {
    label: "Halloweenská noc",
    title: "Nejlepší filmy na Halloween",
    description:
      "Dýně, kostýmy a věci, které vylézají 31. října. Od strašidelných filmů pro celou rodinu po ty, které pro děti opravdu nejsou.",
  },
  korean: {
    label: "Z Koreje",
    title: "Nejlepší korejské filmy a K-dramata",
    description:
      "Korejské filmy a K-dramata v té nejoceňovanější podobě: thrillery, pomsta, romantika i seriály, které všichni zhltli naráz.",
  },
  french: {
    label: "En français",
    title: "Nejlepší francouzské filmy",
    description:
      "Francouzsky mluvené filmy, které si zamilovali i lidé mimo Francii. Zapněte si titulky – stojí to za to.",
  },
  "spanish-language": {
    label: "En español",
    title: "Nejlepší španělsky mluvené filmy a seriály",
    description:
      "Filmy a seriály ve španělštině – ze Španělska, Mexika i Argentiny. Hlavně thrillery, ty jim jdou opravdu skvěle.",
  },
  classics: {
    label: "Před rokem 1970",
    title: "Nejlepší klasické filmy",
    description:
      "Filmy, od kterých se učili všichni ostatní. Všechno tady vzniklo před rokem 1970 a pořád to funguje.",
  },
  "best-of-the-1970s": {
    label: "Sedmdesátky",
    title: "Nejlepší filmy 70. let",
    description:
      "Nový Hollywood, paranoidní thrillery a první blockbustery. Desetiletí, kdy režisérům nikdo nemluvil do práce.",
  },
  "best-of-the-1980s": {
    label: "Osmdesátky",
    title: "Nejlepší filmy a seriály 80. let",
    description:
      "Syntezátory, poctivé triky a filmy, které celá generace přetáčela na kazetách. Osmdesátky v nejlepší formě.",
  },
  "best-of-the-1990s": {
    label: "Devadesátky",
    title: "Nejlepší filmy a seriály 90. let",
    description:
      "Průlomy nezávislého filmu, thrillery na vrcholu a poslední desetiletí, než se ze všeho stala franšíza.",
  },
  "best-of-the-2000s": {
    label: "Nultá léta",
    title: "Nejlepší filmy a seriály z let 2000–2009",
    description:
      "Trilogie, kvalitní televize, která se teprve rozjížděla, a animace, která dospěla. To nejlepší z let 2000–2009.",
  },
  "best-of-the-2010s": {
    label: "Desátá léta",
    title: "Nejlepší filmy a seriály z let 2010–2019",
    description:
      "Zlatý věk seriálů, propojené filmové vesmíry a pár filmů, které nikdo nečekal. To nejlepší z let 2010–2019.",
  },
  "best-of-the-2020s": {
    label: "Tohle desetiletí",
    title: "Nejlepší filmy a seriály od roku 2020",
    description:
      "To nejlepší z právě běžícího desetiletí, průběžně doplňované. Hodnotilo je dost lidí, aby to mělo váhu.",
  },
};
