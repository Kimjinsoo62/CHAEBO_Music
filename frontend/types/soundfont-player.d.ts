declare module 'soundfont-player' {
    interface Player {
        play(note: string | number, when?: number, options?: { duration?: number; gain?: number }): Player;
        stop(): void;
    }

    interface InstrumentOptions {
        gain?: number;
        attack?: number;
        decay?: number;
        sustain?: number;
        release?: number;
    }

    function instrument(
        ac: AudioContext,
        name: string,
        options?: InstrumentOptions
    ): Promise<Player>;

    export { instrument, Player };
    export default { instrument };
}
