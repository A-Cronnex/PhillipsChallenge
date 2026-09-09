import { type Coord, type Units } from "@turf/helpers";
import { AbstractAnimatedCoordinates, type AnimatedCoordinates } from "./AbstractAnimatedCoordinates";
interface AnimatedRouteToValue {
    end: {
        point: Coord | AnimatedCoordinates;
    }
    /**
     * Animate to this length of the coordinates array
     */
     | {
        along: number;
        units?: Units;
    };
}
interface AnimatedRouteState {
    actRoute?: AnimatedCoordinates[];
    fullRoute: AnimatedCoordinates[];
    end: {
        from: number;
        current?: number;
        to: number;
    } & ({
        point?: Coord | AnimatedCoordinates;
    } | {
        along?: number;
    });
}
export declare class AnimatedRouteCoordinatesArray extends AbstractAnimatedCoordinates<AnimatedRouteState, AnimatedRouteToValue> {
    /**
     * Calculate initial state
     *
     * @param coordinatesArray -
     * @returns {AnimatedRouteState}
     */
    protected onInitialState(coordinatesArray: AnimatedCoordinates[]): AnimatedRouteState;
    /**
     * Calculate value from state
     *
     * @param state - Previous state
     * @returns {AnimatedCoordinates[]}
     */
    protected onGetValue(state: AnimatedRouteState): AnimatedCoordinates[];
    /**
     * Calculates state based on startingState and progress, returns a new state
     *
     * @param state - Previous state
     * @param progress - Value between 0 and 1
     * @returns {AnimatedRouteState}
     */
    protected onCalculate(state: AnimatedRouteState, progress: number): AnimatedRouteState;
    /**
     * Subclasses can override to start a new animation
     *
     * @param state -
     * @param toValue - to value from animate
     * @returns {object} The state
     */
    protected onStart(state: AnimatedRouteState, toValue: AnimatedRouteToValue): AnimatedRouteState;
    get originalRoute(): AnimatedCoordinates[];
}
export {};
//# sourceMappingURL=AnimatedRouteCoordinatesArray.d.ts.map