/**
 * The pool the daily puzzle draws from.
 *
 * Baked into the repo rather than fetched: the puzzle has to be the same for
 * everyone who opens the page on a given day, and TMDB's popularity ordering
 * shifts from one hour to the next. Every entry cleared a vote-count floor on
 * TMDB, which is the closest available proxy for "enough people have seen this
 * for guessing it to be fair".
 *
 * The title is kept for review and as a fallback; everything the game shows is
 * read from TMDB at request time, so a re-titling upstream follows along.
 *
 * Ordered by id on purpose – the order must not leak how well known a film is.
 * Appending is safe; see `pickPuzzleForDay` for what it does to the rotation.
 */
export interface PuzzleEntry {
  id: number;
  title: string;
}

export const PUZZLE_POOL: PuzzleEntry[] = [
  { id: 11, title: "Star Wars" }, // 1977
  { id: 12, title: "Finding Nemo" }, // 2003
  { id: 13, title: "Forrest Gump" }, // 1994
  { id: 14, title: "American Beauty" }, // 1999
  { id: 19, title: "Metropolis" }, // 1927
  { id: 22, title: "Pirates of the Caribbean: The Curse of the Black Pearl" }, // 2003
  { id: 24, title: "Kill Bill: Vol. 1" }, // 2003
  { id: 28, title: "Apocalypse Now" }, // 1979
  { id: 38, title: "Eternal Sunshine of the Spotless Mind" }, // 2004
  { id: 58, title: "Pirates of the Caribbean: Dead Man's Chest" }, // 2006
  { id: 62, title: "2001: A Space Odyssey" }, // 1968
  { id: 73, title: "American History X" }, // 1998
  { id: 77, title: "Memento" }, // 2000
  { id: 78, title: "Blade Runner" }, // 1982
  { id: 85, title: "Raiders of the Lost Ark" }, // 1981
  { id: 98, title: "Gladiator" }, // 2000
  { id: 100, title: "Lock, Stock and Two Smoking Barrels" }, // 1998
  { id: 101, title: "Léon: The Professional" }, // 1994
  { id: 103, title: "Taxi Driver" }, // 1976
  { id: 105, title: "Back to the Future" }, // 1985
  { id: 111, title: "Scarface" }, // 1983
  { id: 118, title: "Charlie and the Chocolate Factory" }, // 2005
  { id: 120, title: "The Lord of the Rings: The Fellowship of the Ring" }, // 2001
  { id: 121, title: "The Lord of the Rings: The Two Towers" }, // 2002
  { id: 122, title: "The Lord of the Rings: The Return of the King" }, // 2003
  { id: 128, title: "Princess Mononoke" }, // 1997
  { id: 129, title: "Spirited Away" }, // 2001
  { id: 155, title: "The Dark Knight" }, // 2008
  { id: 162, title: "Edward Scissorhands" }, // 1990
  { id: 165, title: "Back to the Future Part II" }, // 1989
  { id: 185, title: "A Clockwork Orange" }, // 1971
  { id: 207, title: "Dead Poets Society" }, // 1989
  { id: 217, title: "Indiana Jones and the Kingdom of the Crystal Skull" }, // 2008
  { id: 218, title: "The Terminator" }, // 1984
  { id: 238, title: "The Godfather" }, // 1972
  { id: 239, title: "Some Like It Hot" }, // 1959
  { id: 240, title: "The Godfather Part II" }, // 1974
  { id: 272, title: "Batman Begins" }, // 2005
  { id: 274, title: "The Silence of the Lambs" }, // 1991
  { id: 278, title: "The Shawshank Redemption" }, // 1994
  { id: 279, title: "Amadeus" }, // 1984
  { id: 280, title: "Terminator 2: Judgment Day" }, // 1991
  { id: 285, title: "Pirates of the Caribbean: At World's End" }, // 2007
  { id: 289, title: "Casablanca" }, // 1943
  { id: 311, title: "Once Upon a Time in America" }, // 1984
  { id: 329, title: "Jurassic Park" }, // 1993
  { id: 335, title: "Once Upon a Time in the West" }, // 1968
  { id: 346, title: "Seven Samurai" }, // 1954
  { id: 348, title: "Alien" }, // 1979
  { id: 350, title: "The Devil Wears Prada" }, // 2006
  { id: 389, title: "12 Angry Men" }, // 1957
  { id: 393, title: "Kill Bill: Vol. 2" }, // 2004
  { id: 406, title: "La Haine" }, // 1995
  { id: 411, title: "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe" }, // 2005
  { id: 423, title: "The Pianist" }, // 2002
  { id: 424, title: "Schindler's List" }, // 1993
  { id: 425, title: "Ice Age" }, // 2002
  { id: 426, title: "Vertigo" }, // 1958
  { id: 429, title: "The Good, the Bad and the Ugly" }, // 1966
  { id: 489, title: "Good Will Hunting" }, // 1997
  { id: 490, title: "The Seventh Seal" }, // 1957
  { id: 497, title: "The Green Mile" }, // 1999
  { id: 500, title: "Reservoir Dogs" }, // 1992
  { id: 510, title: "One Flew Over the Cuckoo's Nest" }, // 1975
  { id: 524, title: "Casino" }, // 1995
  { id: 539, title: "Psycho" }, // 1960
  { id: 550, title: "Fight Club" }, // 1999
  { id: 557, title: "Spider-Man" }, // 2002
  { id: 558, title: "Spider-Man 2" }, // 2004
  { id: 559, title: "Spider-Man 3" }, // 2007
  { id: 564, title: "The Mummy" }, // 1999
  { id: 567, title: "Rear Window" }, // 1954
  { id: 582, title: "The Lives of Others" }, // 2006
  { id: 585, title: "Monsters, Inc." }, // 2001
  { id: 591, title: "The Da Vinci Code" }, // 2006
  { id: 597, title: "Titanic" }, // 1997
  { id: 598, title: "City of God" }, // 2002
  { id: 600, title: "Full Metal Jacket" }, // 1987
  { id: 601, title: "E.T. the Extra-Terrestrial" }, // 1982
  { id: 602, title: "Independence Day" }, // 1996
  { id: 603, title: "The Matrix" }, // 1999
  { id: 604, title: "The Matrix Reloaded" }, // 2003
  { id: 607, title: "Men in Black" }, // 1997
  { id: 629, title: "The Usual Suspects" }, // 1995
  { id: 637, title: "Life Is Beautiful" }, // 1997
  { id: 640, title: "Catch Me If You Can" }, // 2002
  { id: 641, title: "Requiem for a Dream" }, // 2000
  { id: 652, title: "Troy" }, // 2004
  { id: 670, title: "Oldboy" }, // 2003
  { id: 671, title: "Harry Potter and the Philosopher's Stone" }, // 2001
  { id: 672, title: "Harry Potter and the Chamber of Secrets" }, // 2002
  { id: 673, title: "Harry Potter and the Prisoner of Azkaban" }, // 2004
  { id: 674, title: "Harry Potter and the Goblet of Fire" }, // 2005
  { id: 675, title: "Harry Potter and the Order of the Phoenix" }, // 2007
  { id: 680, title: "Pulp Fiction" }, // 1994
  { id: 694, title: "The Shining" }, // 1980
  { id: 744, title: "Top Gun" }, // 1986
  { id: 745, title: "The Sixth Sense" }, // 1999
  { id: 752, title: "V for Vendetta" }, // 2006
  { id: 767, title: "Harry Potter and the Half-Blood Prince" }, // 2009
  { id: 769, title: "GoodFellas" }, // 1990
  { id: 807, title: "Se7en" }, // 1995
  { id: 808, title: "Shrek" }, // 2001
  { id: 809, title: "Shrek 2" }, // 2004
  { id: 810, title: "Shrek the Third" }, // 2007
  { id: 843, title: "In the Mood for Love" }, // 2000
  { id: 857, title: "Saving Private Ryan" }, // 1998
  { id: 862, title: "Toy Story" }, // 1995
  { id: 863, title: "Toy Story 2" }, // 1999
  { id: 872, title: "Singin' in the Rain" }, // 1952
  { id: 914, title: "The Great Dictator" }, // 1940
  { id: 920, title: "Cars" }, // 2006
  { id: 935, title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb" }, // 1964
  { id: 938, title: "For a Few Dollars More" }, // 1965
  { id: 947, title: "Lawrence of Arabia" }, // 1962
  { id: 975, title: "Paths of Glory" }, // 1957
  { id: 1091, title: "The Thing" }, // 1982
  { id: 1124, title: "The Prestige" }, // 2006
  { id: 1250, title: "Ghost Rider" }, // 2007
  { id: 1271, title: "300" }, // 2007
  { id: 1422, title: "The Departed" }, // 2006
  { id: 1585, title: "It's a Wonderful Life" }, // 1946
  { id: 1726, title: "Iron Man" }, // 2008
  { id: 1771, title: "Captain America: The First Avenger" }, // 2011
  { id: 1858, title: "Transformers" }, // 2007
  { id: 1865, title: "Pirates of the Caribbean: On Stranger Tides" }, // 2011
  { id: 1891, title: "The Empire Strikes Back" }, // 1980
  { id: 1892, title: "Return of the Jedi" }, // 1983
  { id: 1893, title: "Star Wars: Episode I - The Phantom Menace" }, // 1999
  { id: 1894, title: "Star Wars: Episode II - Attack of the Clones" }, // 2002
  { id: 1895, title: "Star Wars: Episode III - Revenge of the Sith" }, // 2005
  { id: 1930, title: "The Amazing Spider-Man" }, // 2012
  { id: 1955, title: "The Elephant Man" }, // 1980
  { id: 2062, title: "Ratatouille" }, // 2007
  { id: 3082, title: "Modern Times" }, // 1936
  { id: 3175, title: "Barry Lyndon" }, // 1975
  { id: 4348, title: "Pride & Prejudice" }, // 2005
  { id: 4922, title: "The Curious Case of Benjamin Button" }, // 2008
  { id: 4935, title: "Howl's Moving Castle" }, // 2004
  { id: 6479, title: "I Am Legend" }, // 2007
  { id: 7345, title: "There Will Be Blood" }, // 2007
  { id: 8355, title: "Ice Age: Dawn of the Dinosaurs" }, // 2009
  { id: 8373, title: "Transformers: Revenge of the Fallen" }, // 2009
  { id: 8392, title: "My Neighbor Totoro" }, // 1988
  { id: 8587, title: "The Lion King" }, // 1994
  { id: 8966, title: "Twilight" }, // 2008
  { id: 9277, title: "The Sting" }, // 1973
  { id: 9806, title: "The Incredibles" }, // 2004
  { id: 10138, title: "Iron Man 2" }, // 2010
  { id: 10191, title: "How to Train Your Dragon" }, // 2010
  { id: 10192, title: "Shrek Forever After" }, // 2010
  { id: 10193, title: "Toy Story 3" }, // 2010
  { id: 10195, title: "Thor" }, // 2011
  { id: 10494, title: "Perfect Blue" }, // 1998
  { id: 10515, title: "Castle in the Sky" }, // 1986
  { id: 10528, title: "Sherlock Holmes" }, // 2009
  { id: 10681, title: "WALL·E" }, // 2008
  { id: 11036, title: "The Notebook" }, // 2004
  { id: 11216, title: "Cinema Paradiso" }, // 1988
  { id: 11324, title: "Shutter Island" }, // 2010
  { id: 11423, title: "Memories of Murder" }, // 2003
  { id: 11778, title: "The Deer Hunter" }, // 1978
  { id: 12153, title: "White Chicks" }, // 2004
  { id: 12155, title: "Alice in Wonderland" }, // 2010
  { id: 12444, title: "Harry Potter and the Deathly Hallows: Part 1" }, // 2010
  { id: 12445, title: "Harry Potter and the Deathly Hallows: Part 2" }, // 2011
  { id: 12477, title: "Grave of the Fireflies" }, // 1988
  { id: 13223, title: "Gran Torino" }, // 2008
  { id: 14160, title: "Up" }, // 2009
  { id: 14161, title: "2012" }, // 2009
  { id: 14836, title: "Coraline" }, // 2009
  { id: 16869, title: "Inglourious Basterds" }, // 2009
  { id: 18239, title: "The Twilight Saga: New Moon" }, // 2009
  { id: 18785, title: "The Hangover" }, // 2009
  { id: 19404, title: "Dilwale Dulhania Le Jayenge" }, // 1995
  { id: 19995, title: "Avatar" }, // 2009
  { id: 20352, title: "Despicable Me" }, // 2010
  { id: 24021, title: "The Twilight Saga: Eclipse" }, // 2010
  { id: 24428, title: "The Avengers" }, // 2012
  { id: 26466, title: "Triangle" }, // 2009
  { id: 27205, title: "Inception" }, // 2010
  { id: 28178, title: "Hachi: A Dog's Tale" }, // 2009
  { id: 37165, title: "The Truman Show" }, // 1998
  { id: 37724, title: "Skyfall" }, // 2012
  { id: 38356, title: "Transformers: Dark of the Moon" }, // 2011
  { id: 39254, title: "Real Steel" }, // 2011
  { id: 43949, title: "Flipped" }, // 2010
  { id: 44214, title: "Black Swan" }, // 2010
  { id: 46738, title: "Incendies" }, // 2010
  { id: 49013, title: "Cars 2" }, // 2011
  { id: 49026, title: "The Dark Knight Rises" }, // 2012
  { id: 49047, title: "Gravity" }, // 2013
  { id: 49051, title: "The Hobbit: An Unexpected Journey" }, // 2012
  { id: 49521, title: "Man of Steel" }, // 2013
  { id: 50014, title: "The Help" }, // 2011
  { id: 50619, title: "The Twilight Saga: Breaking Dawn - Part 1" }, // 2011
  { id: 50620, title: "The Twilight Saga: Breaking Dawn - Part 2" }, // 2012
  { id: 56292, title: "Mission: Impossible - Ghost Protocol" }, // 2011
  { id: 57158, title: "The Hobbit: The Desolation of Smaug" }, // 2013
  { id: 57800, title: "Ice Age: Continental Drift" }, // 2012
  { id: 62177, title: "Brave" }, // 2012
  { id: 62211, title: "Monsters University" }, // 2013
  { id: 68718, title: "Django Unchained" }, // 2012
  { id: 68721, title: "Iron Man 3" }, // 2013
  { id: 68726, title: "Pacific Rim" }, // 2013
  { id: 70160, title: "The Hunger Games" }, // 2012
  { id: 72190, title: "World War Z" }, // 2013
  { id: 75656, title: "Now You See Me" }, // 2013
  { id: 76338, title: "Thor: The Dark World" }, // 2013
  { id: 76341, title: "Mad Max: Fury Road" }, // 2015
  { id: 76600, title: "Avatar: The Way of Water" }, // 2022
  { id: 77338, title: "The Intouchables" }, // 2011
  { id: 80321, title: "Madagascar 3: Europe's Most Wanted" }, // 2012
  { id: 82992, title: "Fast & Furious 6" }, // 2013
  { id: 83533, title: "Avatar: Fire and Ash" }, // 2025
  { id: 87827, title: "Life of Pi" }, // 2012
  { id: 91314, title: "Transformers: Age of Extinction" }, // 2014
  { id: 93456, title: "Despicable Me 2" }, // 2013
  { id: 99861, title: "Avengers: Age of Ultron" }, // 2015
  { id: 100402, title: "Captain America: The Winter Soldier" }, // 2014
  { id: 101299, title: "The Hunger Games: Catching Fire" }, // 2013
  { id: 102382, title: "The Amazing Spider-Man 2" }, // 2014
  { id: 102651, title: "Maleficent" }, // 2014
  { id: 102899, title: "Ant-Man" }, // 2015
  { id: 103663, title: "The Hunt" }, // 2012
  { id: 106646, title: "The Wolf of Wall Street" }, // 2013
  { id: 109445, title: "Frozen" }, // 2013
  { id: 118340, title: "Guardians of the Galaxy" }, // 2014
  { id: 119450, title: "Dawn of the Planet of the Apes" }, // 2014
  { id: 120467, title: "The Grand Budapest Hotel" }, // 2014
  { id: 122917, title: "The Hobbit: The Battle of the Five Armies" }, // 2014
  { id: 127380, title: "Finding Dory" }, // 2016
  { id: 127585, title: "X-Men: Days of Future Past" }, // 2014
  { id: 131631, title: "The Hunger Games: Mockingjay - Part 1" }, // 2014
  { id: 135397, title: "Jurassic World" }, // 2015
  { id: 137113, title: "Edge of Tomorrow" }, // 2014
  { id: 138843, title: "The Conjuring" }, // 2013
  { id: 140607, title: "Star Wars: The Force Awakens" }, // 2015
  { id: 146233, title: "Prisoners" }, // 2013
  { id: 150540, title: "Inside Out" }, // 2015
  { id: 152601, title: "Her" }, // 2013
  { id: 157336, title: "Interstellar" }, // 2014
  { id: 166426, title: "Pirates of the Caribbean: Dead Men Tell No Tales" }, // 2017
  { id: 168259, title: "Furious 7" }, // 2015
  { id: 177572, title: "Big Hero 6" }, // 2014
  { id: 177677, title: "Mission: Impossible - Rogue Nation" }, // 2015
  { id: 181808, title: "Star Wars: The Last Jedi" }, // 2017
  { id: 181812, title: "Star Wars: The Rise of Skywalker" }, // 2019
  { id: 198663, title: "The Maze Runner" }, // 2014
  { id: 205596, title: "The Imitation Game" }, // 2014
  { id: 206647, title: "Spectre" }, // 2015
  { id: 207703, title: "Kingsman: The Secret Service" }, // 2015
  { id: 209112, title: "Batman v Superman: Dawn of Justice" }, // 2016
  { id: 210577, title: "Gone Girl" }, // 2014
  { id: 211672, title: "Minions" }, // 2015
  { id: 228150, title: "Fury" }, // 2014
  { id: 240832, title: "Lucy" }, // 2014
  { id: 244786, title: "Whiplash" }, // 2014
  { id: 245891, title: "John Wick" }, // 2014
  { id: 246655, title: "X-Men: Apocalypse" }, // 2016
  { id: 259316, title: "Fantastic Beasts and Where to Find Them" }, // 2016
  { id: 260513, title: "Incredibles 2" }, // 2018
  { id: 260514, title: "Cars 3" }, // 2017
  { id: 263115, title: "Logan" }, // 2017
  { id: 264644, title: "Room" }, // 2015
  { id: 264660, title: "Ex Machina" }, // 2015
  { id: 269149, title: "Zootopia" }, // 2016
  { id: 271110, title: "Captain America: Civil War" }, // 2016
  { id: 273248, title: "The Hateful Eight" }, // 2015
  { id: 274870, title: "Passengers" }, // 2016
  { id: 277834, title: "Moana" }, // 2016
  { id: 278927, title: "The Jungle Book" }, // 2016
  { id: 281957, title: "The Revenant" }, // 2015
  { id: 283995, title: "Guardians of the Galaxy Vol. 2" }, // 2017
  { id: 284052, title: "Doctor Strange" }, // 2016
  { id: 284053, title: "Thor: Ragnarok" }, // 2017
  { id: 284054, title: "Black Panther" }, // 2018
  { id: 286217, title: "The Martian" }, // 2015
  { id: 290098, title: "The Handmaiden" }, // 2016
  { id: 293660, title: "Deadpool" }, // 2016
  { id: 297761, title: "Suicide Squad" }, // 2016
  { id: 297762, title: "Wonder Woman" }, // 2017
  { id: 297802, title: "Aquaman" }, // 2018
  { id: 299534, title: "Avengers: Endgame" }, // 2019
  { id: 299536, title: "Avengers: Infinity War" }, // 2018
  { id: 299537, title: "Captain Marvel" }, // 2019
  { id: 301528, title: "Toy Story 4" }, // 2019
  { id: 313369, title: "La La Land" }, // 2016
  { id: 315162, title: "Puss in Boots: The Last Wish" }, // 2022
  { id: 315635, title: "Spider-Man: Homecoming" }, // 2017
  { id: 321612, title: "Beauty and the Beast" }, // 2017
  { id: 324552, title: "John Wick: Chapter 2" }, // 2017
  { id: 324786, title: "Hacksaw Ridge" }, // 2016
  { id: 324852, title: "Despicable Me 3" }, // 2017
  { id: 324857, title: "Spider-Man: Into the Spider-Verse" }, // 2018
  { id: 328111, title: "The Secret Life of Pets" }, // 2016
  { id: 329865, title: "Arrival" }, // 2016
  { id: 330457, title: "Frozen II" }, // 2019
  { id: 330459, title: "Rogue One: A Star Wars Story" }, // 2016
  { id: 333339, title: "Ready Player One" }, // 2018
  { id: 334543, title: "Lion" }, // 2016
  { id: 335983, title: "Venom" }, // 2018
  { id: 335984, title: "Blade Runner 2049" }, // 2017
  { id: 337339, title: "The Fate of the Furious" }, // 2017
  { id: 337404, title: "Cruella" }, // 2021
  { id: 339403, title: "Baby Driver" }, // 2017
  { id: 346364, title: "It" }, // 2017
  { id: 346698, title: "Barbie" }, // 2023
  { id: 351286, title: "Jurassic World: Fallen Kingdom" }, // 2018
  { id: 353081, title: "Mission: Impossible - Fallout" }, // 2018
  { id: 353486, title: "Jumanji: Welcome to the Jungle" }, // 2017
  { id: 354912, title: "Coco" }, // 2017
  { id: 359940, title: "Three Billboards Outside Ebbing, Missouri" }, // 2017
  { id: 361743, title: "Top Gun: Maverick" }, // 2022
  { id: 363088, title: "Ant-Man and the Wasp" }, // 2018
  { id: 370172, title: "No Time to Die" }, // 2021
  { id: 372058, title: "Your Name." }, // 2016
  { id: 374720, title: "Dunkirk" }, // 2017
  { id: 378064, title: "A Silent Voice: The Movie" }, // 2016
  { id: 381284, title: "Hidden Figures" }, // 2016
  { id: 381288, title: "Split" }, // 2017
  { id: 383498, title: "Deadpool 2" }, // 2018
  { id: 384018, title: "Fast & Furious Presents: Hobbs & Shaw" }, // 2019
  { id: 385128, title: "F9" }, // 2021
  { id: 385687, title: "Fast X" }, // 2023
  { id: 398818, title: "Call Me by Your Name" }, // 2017
  { id: 400928, title: "Gifted" }, // 2017
  { id: 402431, title: "Wicked" }, // 2024
  { id: 406997, title: "Wonder" }, // 2017
  { id: 411088, title: "The Invisible Guest" }, // 2017
  { id: 414906, title: "The Batman" }, // 2022
  { id: 419430, title: "Get Out" }, // 2017
  { id: 420817, title: "Aladdin" }, // 2019
  { id: 420818, title: "The Lion King" }, // 2019
  { id: 424694, title: "Bohemian Rhapsody" }, // 2018
  { id: 429617, title: "Spider-Man: Far From Home" }, // 2019
  { id: 438148, title: "Minions: The Rise of Gru" }, // 2022
  { id: 438631, title: "Dune" }, // 2021
  { id: 447332, title: "A Quiet Place" }, // 2018
  { id: 447365, title: "Guardians of the Galaxy Vol. 3" }, // 2023
  { id: 449176, title: "Love, Simon" }, // 2018
  { id: 453395, title: "Doctor Strange in the Multiverse of Madness" }, // 2022
  { id: 466272, title: "Once Upon a Time... in Hollywood" }, // 2019
  { id: 475557, title: "Joker" }, // 2019
  { id: 490132, title: "Green Book" }, // 2018
  { id: 496243, title: "Parasite" }, // 2019
  { id: 502356, title: "The Super Mario Bros. Movie" }, // 2023
  { id: 505642, title: "Black Panther: Wakanda Forever" }, // 2022
  { id: 507086, title: "Jurassic World Dominion" }, // 2022
  { id: 508442, title: "Soul" }, // 2020
  { id: 508965, title: "Klaus" }, // 2019
  { id: 512200, title: "Jumanji: The Next Level" }, // 2019
  { id: 515001, title: "Jojo Rabbit" }, // 2019
  { id: 519182, title: "Despicable Me 4" }, // 2024
  { id: 527641, title: "Five Feet Apart" }, // 2019
  { id: 530915, title: "1917" }, // 2019
  { id: 533535, title: "Deadpool & Wolverine" }, // 2024
  { id: 545611, title: "Everything Everywhere All at Once" }, // 2022
  { id: 546554, title: "Knives Out" }, // 2019
  { id: 555604, title: "Guillermo del Toro's Pinocchio" }, // 2022
  { id: 569094, title: "Spider-Man: Across the Spider-Verse" }, // 2023
  { id: 572802, title: "Aquaman and the Lost Kingdom" }, // 2023
  { id: 600354, title: "The Father" }, // 2020
  { id: 616037, title: "Thor: Love and Thunder" }, // 2022
  { id: 617126, title: "The Fantastic 4: First Steps" }, // 2025
  { id: 634649, title: "Spider-Man: No Way Home" }, // 2021
  { id: 635302, title: "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train" }, // 2020
  { id: 637920, title: "Miracle in Cell No. 7" }, // 2019
  { id: 687163, title: "Project Hail Mary" }, // 2026
  { id: 693134, title: "Dune: Part Two" }, // 2024
  { id: 713704, title: "Evil Dead Rise" }, // 2023
  { id: 791373, title: "Zack Snyder's Justice League" }, // 2021
  { id: 803796, title: "KPop Demon Hunters" }, // 2025
  { id: 822119, title: "Captain America: Brave New World" }, // 2025
  { id: 845781, title: "Red One" }, // 2024
  { id: 872585, title: "Oppenheimer" }, // 2023
  { id: 911430, title: "F1" }, // 2025
  { id: 933260, title: "The Substance" }, // 2024
  { id: 936075, title: "Michael" }, // 2026
  { id: 939243, title: "Sonic the Hedgehog 3" }, // 2024
  { id: 945961, title: "Alien: Romulus" }, // 2024
  { id: 950387, title: "A Minecraft Movie" }, // 2025
  { id: 950396, title: "The Gorge" }, // 2025
  { id: 986056, title: "Thunderbolts*" }, // 2025
  { id: 1010581, title: "My Fault" }, // 2023
  { id: 1022789, title: "Inside Out 2" }, // 2024
  { id: 1054867, title: "One Battle After Another" }, // 2025
  { id: 1061474, title: "Superman" }, // 2025
  { id: 1062722, title: "Frankenstein" }, // 2025
  { id: 1078605, title: "Weapons" }, // 2025
  { id: 1084242, title: "Zootopia 2" }, // 2025
  { id: 1184918, title: "The Wild Robot" }, // 2024
  { id: 1226863, title: "The Super Mario Galaxy Movie" }, // 2026
  { id: 1233413, title: "Sinners" }, // 2025
  { id: 1234821, title: "Jurassic World Rebirth" }, // 2025
  { id: 1241982, title: "Moana 2" }, // 2024
  { id: 1242898, title: "Predator: Badlands" }, // 2025
  { id: 1339713, title: "Obsession" }, // 2026
];
