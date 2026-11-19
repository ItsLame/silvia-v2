// Everyday words, a few card-table ones, and a handful from a software engineer's day.
// Bucketed by length at load; levels draw from longer buckets as they go up.
const RAW = `
cat dog sun hat cup map pen box key fox owl bee ant egg jam kit log mud net oak pie rug sky toy van web
yak zip ace art bag bat bed bus cab cow day ear elf fan fig gem hen ink jar jet lip mix nut orb pan pig ram
saw sea tea tin top tub wax zoo bug git api cli css
card deck king jack club five nine ball bear bird boat book cake coin corn crab door drum duck fish flag frog
gift goat gold harp hill kite lamp leaf lime lion moon nest note pear pine rain ring road rock rose sail salt
seed ship shoe silk snow soap song star sock tree vase wave wind wolf yarn bark bell bone chip code data loop
node bash byte hash link sync push pull test type font deal suit chip bluff
queen spade heart joker poker chess apple beach bread brick candy chair cloud crown dance dream eagle field
flame fruit ghost glass grape grass honey horse house jelly juice knife lemon light mango maple music night
ocean olive paint panda paper peach pearl piano pilot plant plate prize quilt radio river robot salad scarf
sheep shell skate smile snake spoon storm sugar table tiger toast tower train trail whale wheat zebra array
async build cache class debug fetch merge query route stack state stash token flush
dealer casino wizard anchor animal banana basket breeze bridge bubble button camera candle carpet castle cherry
circle cookie cotton desert dragon flower forest garden ginger guitar hammer island jacket jungle kitten ladder
lizard magnet marble meadow mirror monkey muffin orange parrot pebble pencil pepper pickle planet pocket puzzle
rabbit ribbon rocket saddle silver spider spring sunset temple ticket tomato turtle velvet violin walnut window
winter yogurt branch commit deploy docker editor kernel lambda module object python render schema server
socket string syntax walrus binary
shuffle diamond jackpot balloon blanket buffalo cabbage cartoon chicken compass cupcake dolphin feather gallery
giraffe glacier harvest hamster journey kitchen lantern lettuce library lobster mailbox mermaid monster morning
mustard noodles octopus orchard pancake panther peacock pelican penguin pyramid rainbow sandals sparrow station
sunrise teacher thunder tornado trumpet uniform unicorn volcano weather whisker backend browser closure compile
console context promise pointer program refresh request runtime storage tooltip blossom horizon iceberg firefly
aardvark airplane alphabet asteroid backpack baseball birthday blizzard bookcase broccoli campfire cardigan
carousel cinnamon cucumber daffodil dinosaur doughnut elephant envelope fountain gardener goldfish hedgehog
kangaroo keyboard lavender lemonade magician mandolin marigold meatball mosquito mountain notebook painting
passport platypus popsicle porridge raincoat sapphire seahorse skeleton snowball squirrel starfish treasure
umbrella vineyard zucchini compiler database debugger frontend function hardware iterator markdown password
pipeline protocol terminal template variable viewport pinwheel
blackjack solitaire butterfly pineapple sunflower waterfall adventure alligator astronaut avalanche blueberry
bumblebee buttercup cardboard carnation chocolate crocodile dandelion detective fireworks hurricane jellyfish
lightning marmalade nightfall parachute porcupine raspberry scarecrow snowflake spaceship submarine telescope
wonderful algorithm benchmark component container framework hydration interface recursion websocket saxophone
strawberry peppermint sandcastle trampoline watermelon lighthouse chimpanzee basketball blackboard friendship
motorcycle photograph skateboard toothbrush woodpecker typescript javascript middleware repository deployment
dependency breakpoint playground
grasshopper dragonfruit caterpillar hummingbird nightingale wheelbarrow gingerbread
`;

// Spell names (see SPECIALS in engine.ts) are typed to cast, so they never fall as words.
const RESERVED = new Set(["wipe", "ice", "slow", "mend"]);

const BY_LENGTH = new Map<number, string[]>();
for (const w of new Set(RAW.split(/\s+/).filter((w) => w && !RESERVED.has(w)))) {
  const list = BY_LENGTH.get(w.length) ?? [];
  list.push(w);
  BY_LENGTH.set(w.length, list);
}

/** Word lengths a level draws from: short to start, longer as levels go up. */
export function lengthRange(level: number): [number, number] {
  const min = Math.min(3 + Math.floor((level - 1) / 2), 6);
  const max = Math.min(5 + level, 11);
  return [min, max];
}

/** A random word for this level that isn't already on screen. */
export function pickWord(level: number, onScreen: Set<string>): string {
  const [min, max] = lengthRange(level);
  for (let attempt = 0; attempt < 20; attempt++) {
    const len = min + Math.floor(Math.random() * (max - min + 1));
    const list = BY_LENGTH.get(len);
    if (!list?.length) continue;
    const word = list[Math.floor(Math.random() * list.length)];
    if (!onScreen.has(word)) return word;
  }
  const fallback = BY_LENGTH.get(min)!;
  return fallback[Math.floor(Math.random() * fallback.length)];
}
