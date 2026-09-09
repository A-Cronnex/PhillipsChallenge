import { AbstractAnimatedCoordinates, type AnimatedCoordinates } from "./AbstractAnimatedCoordinates";
interface CoordinatesState {
    coords: AnimatedCoordinates[];
    targetCoords: AnimatedCoordinates[];
}
export declare class AnimatedCoordinatesArray extends AbstractAnimatedCoordinates<CoordinatesState> {
    /**
     * Subclasses can override to calculate initial state
     *
     * @param coordinatesArray - to value from animate
     * @returns {object} - the state object
     */
    protected onInitialState(coordinatesArray: AnimatedCoordinates[]): CoordinatesState;
    /**
     * Subclasses can override getValue to calculate value from state. Value is
     * typically coordinates array, but can be anything
     *
     * @param state - either state from initialState and/or from calculate
     * @returns {object}
     */
    protected onGetValue(state: CoordinatesState): CoordinatesState["coords"];
    /**
     * Calculates state based on startingState and progress, returns a new state
     *
     * @param state - state object from initialState and/or from calculate
     * @param progress - value between 0 and 1
     * @returns {object} next state
     */
    onCalculate(state: CoordinatesState, progress: number): CoordinatesState;
    /**
     * Subclasses can override to start a new animation
     *
     * @param state - to value from animate
     * @param toValue - the current coordinates array to start from
     * @returns The state
     */
    protected onStart(state: CoordinatesState, toValue: AnimatedCoordinates[]): CoordinatesState;
}
export {};
//# sourceMappingURL=AnimatedCoordinatesArray.d.ts.map