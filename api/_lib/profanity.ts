import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity"

/*
 * The board's name filter. It lives on the server only - the word list would be dead
 * weight in the game's bundle, and a check the player's own browser runs stops nobody.
 */

/** Built once per warm instance - compiling the dataset's patterns isn't free */
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
})

/** The separators a name may carry - each one a way to space a word out past the matcher */
const SEPARATORS = /[ ._'-]/g

/**
 * Whether a name has something in it the board shouldn't show. Sees through the usual
 * dodges - leetspeak, lookalike characters, stretched letters - and knows the innocent
 * words that merely contain a bad one.
 *
 * The name is read a second time with its separators taken out, which catches a word
 * spelled `l.i.k.e t-h-i-s`. That errs on the strict side: two clean words that happen
 * to join into a bad one are turned away too.
 *
 * @param name - A name already through `cleanName`
 */
export function isObscene(name: string): boolean {
    return matcher.hasMatch(name) || matcher.hasMatch(name.replace(SEPARATORS, ""))
}
