// Port of the seeded System.Random of .NET Framework (Knuth's subtractive generator).
// The shake and glitch effects use seeded random numbers, so the sequence must match the C# original.

const MBIG = 2147483647;
const MSEED = 161803398;

export class NetRandom {
  constructor(seed) {
    const seedArray = new Array(56).fill(0);
    const subtraction = seed === -2147483648 ? 2147483647 : Math.abs(seed);
    let mj = MSEED - subtraction;
    seedArray[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = seedArray[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        seedArray[i] -= seedArray[1 + ((i + 30) % 55)];
        if (seedArray[i] < 0) seedArray[i] += MBIG;
      }
    }
    this._seedArray = seedArray;
    this._inext = 0;
    this._inextp = 21;
  }

  _internalSample() {
    let locINext = this._inext;
    let locINextp = this._inextp;
    if (++locINext >= 56) locINext = 1;
    if (++locINextp >= 56) locINextp = 1;
    let retVal = this._seedArray[locINext] - this._seedArray[locINextp];
    if (retVal === MBIG) retVal--;
    if (retVal < 0) retVal += MBIG;
    this._seedArray[locINext] = retVal;
    this._inext = locINext;
    this._inextp = locINextp;
    return retVal;
  }

  nextDouble() {
    return this._internalSample() * (1.0 / MBIG);
  }

  /** Random.Next(maxValue) */
  next(maxValue) {
    return Math.trunc(this.nextDouble() * maxValue);
  }
}
