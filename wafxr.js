'use strict'

var Tone = require('tone')

module.exports = new FX()


function FX() {

    // input chain
    var input = new Tone.Gain(1)
    var crusher = new Tone.BitCrusher(8)
    crusher.wet.value = 0

    var tremolo = new Tone.Tremolo(5, 1)
    tremolo.wet.value = 0

    var vibrato = new Tone.Vibrato(5, 1)
    vibrato.wet.value = 0

    var lowpass = new Tone.Filter (22000, 'lowpass')
    var highpass = new Tone.Filter (0, 'highpass')

    input.chain(vibrato, tremolo, lowpass, highpass, crusher, Tone.Master)


    // instruments
    var synths = []
    var noises = []
    while (synths.length < 3) synths.push(new Tone.Synth())
    while (noises.length < 2) noises.push(new Tone.NoiseSynth())

    synths.concat(noises).forEach(v => {
        v.envelope.releaseCurve = 'linear'
        v.connect(input)
    })

    var getSynth = (function () {
        var i = 0, n = synths.length
        return function () { return synths[i++ % n] }
    })()
    var getNoise = (function () {
        var i = 0, n = noises.length
        return function () { return noises[i++ % n] }
    })()

    window.Tone = Tone
    window.synth = synths[0]
    window.noise = noises[0]


    // a timelineSignal used for calculating ramped values
    var signal = new Tone.TimelineSignal()



    this.play = function (settings) {
        var s = settings
        var holdTime = s.duration + s.attack + s.decay
        var duration = holdTime + s.release

        // input chain
        rampParam(Tone.Master.volume, s.volume)

        tremolo.wet.value = (s.tremolo) ? 1 : 0
        if (s.tremolo) {
            tremolo.depth.value = s.tremolo
            tremolo.frequency.value = s.tremoloFreq || 0
        }

        vibrato.wet.value = (s.vibrato) ? 1 : 0
        if (s.vibrato) {
            vibrato.depth.value = s.vibrato
            vibrato.frequency.value = s.vibratoFreq || 0
        }

        lowpass.frequency.value = s.lowpass || 22000
        if (s.lowpass && s.lowpassSweep) {
            lowpass.frequency.rampTo(s.lowpass + s.lowpassSweep, duration)
        }

        highpass.frequency.value = s.highpass || 0
        if (s.highpass && s.highpassSweep) {
            highpass.frequency.rampTo(s.highpass + s.highpassSweep, duration)
        }

        crusher.wet.value = s.bitcrush ? 1 : 0
        crusher.bits = s.bitcrush || 8

        // instruments
        if (/noise/.test(s.source)) {

            var noise = getNoise()
            noise.noise.type = s.source.split(' ')[0]
            noise.envelope.attack = s.attack
            noise.envelope.decay = s.decay
            noise.envelope.sustain = s.sustain
            noise.envelope.release = s.release

            noise.triggerAttackRelease(holdTime)

        } else {

            var synth = getSynth()
            var type = s.source
            if (s.harmonics > 0) type += s.harmonics
            synth.oscillator.type = type
            synth.envelope.attack = s.attack
            synth.envelope.decay = s.decay
            synth.envelope.sustain = s.sustain
            synth.envelope.release = s.release

            synth.triggerAttackRelease(0, holdTime)

            // set up necessary frequency values with sweeps and jumps
            // times are scaled to t0=0, tn=1, for now
            var f0 = s.frequency
            var fn = s.sweep ? f0 * (1 + s.sweep) : f0
            var t0 = 0
            var tn = 1

            // calculate ramp/jump values
            var t1 = tn * s.jumpAt1
            var t2 = tn * s.jumpAt2
            var j1 = s.jumpBy1 || 0
            var j2 = s.jumpBy2 || 0
            if (t2 < t1) {
                var _temp = t1; t1 = t2; t2 = _temp
                _temp = j1; j1 = j2; j2 = _temp
            }

            if (j1 === 0) t1 = 0
            var f1 = fqInterpolate(t0, tn, f0, fn, t1)
            var f1b = f1 * (1 + j1)
            fn += f1b - f1

            if (j2 === 0) t2 = t1
            var f2 = fqInterpolate(t1, tn, f1b, fn, t2)
            var f2b = f2 * (1 + j2)
            fn += f2b - f2

            // period for repeating the whole sweep/jump process
            var repeat = s.repeat || 0
            if (repeat > 100) repeat = 100
            var period = repeat ? 1 / repeat : duration
            if (period > duration) period = duration

            // init state for scheduling ramps and jumps
            var fq = synth.frequency
            var currF = 0
            var currT = Tone.now()
            var end = currT + duration

            // scale times to the specified period
            t1 *= period
            t2 *= period
            tn = period

            // loop through scheduling one period at a time
            while (currT < end) {
                if (currF != f0) currF = doJump(fq, f0, currT + t0)
                if (currF != f1) currF = doRamp(fq, f1, currT + t1)
                if (currF != f1b) currF = doJump(fq, f1b, currT + t1)
                if (currF != f2) currF = doRamp(fq, f2, currT + t2)
                if (currF != f2b) currF = doJump(fq, f2b, currT + t2)
                if (currF != fn) currF = doRamp(fq, fn, currT + tn)
                currT += period
            }
        }
    }

}


function rampParam(param, value) {
    if (param.value != value) param.rampTo(value, 0.02)
}

function doJump(signal, value, time) {
    signal.setValueAtTime(value, time)
    return value
}

function doRamp(signal, value, time) {
    signal.exponentialRampToValueAtTime(value, time)
    return value
}

function fqInterpolate(t0, tn, f0, fn, t) {
    if (t === t0) return f0
    _signal.setValueAtTime(f0, 0)
    _signal.exponentialRampToValueBetween(fn, 0, tn - t0)
    return _signal.getValueAtTime(t - t0)
}
var _signal = new Tone.TimelineSignal()


