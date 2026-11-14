/* Freestanding spring simulation. Distances use the canvas' shorter dimension. */
enum {
    POSITION_X, POSITION_Y, VELOCITY_X, VELOCITY_Y,
    SQUEEZE, SQUEEZE_VELOCITY, ENERGY, PHASE, STATE_COUNT
};

static double state[STATE_COUNT];
static double accumulator;

static double clamp(double value, double minimum, double maximum) {
    if (value != value) return 0.0;
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

static double absolute(double value) {
    return value < 0.0 ? -value : value;
}

void reset(void) {
    for (int index = 0; index < STATE_COUNT; index++) state[index] = 0.0;
    accumulator = 0.0;
}

/* impulse is a one-frame release event in [0, 1], not a held input. */
void step(double dt, double target_x, double target_y, double pressed, double impulse) {
    dt = clamp(dt, 0.0, 0.1);
    if (dt == 0.0) return;
    target_x = clamp(target_x, -0.12, 0.12);
    target_y = clamp(target_y, -0.12, 0.12);
    pressed = clamp(pressed, 0.0, 1.0);
    impulse = clamp(impulse, 0.0, 1.0);
    state[SQUEEZE_VELOCITY] = clamp(state[SQUEEZE_VELOCITY] - impulse * 2.4, -5.0, 5.0);
    state[ENERGY] = clamp(state[ENERGY] + impulse * 0.85, 0.0, 1.0);

    /* Fixed steps keep rebound and damping consistent on 30–144 Hz displays. */
    const double fixed_dt = 1.0 / 120.0;
    accumulator += dt;
    while (accumulator + 0.000000001 >= fixed_dt) {
        accumulator -= fixed_dt;
        for (int axis = 0; axis < 2; axis++) {
            const double target = axis == 0 ? target_x : target_y;
            const int velocity = axis + 2;
            const double acceleration = 100.0 * (target - state[axis]) - 10.0 * state[velocity];
            state[velocity] = clamp(state[velocity] + acceleration * fixed_dt, -1.5, 1.5);
            state[axis] = clamp(state[axis] + state[velocity] * fixed_dt, -0.24, 0.24);
        }

        const double squeeze_acceleration = 100.0 * (pressed - state[SQUEEZE])
            - 10.0 * state[SQUEEZE_VELOCITY];
        state[SQUEEZE_VELOCITY] = clamp(state[SQUEEZE_VELOCITY]
            + squeeze_acceleration * fixed_dt, -5.0, 5.0);
        state[SQUEEZE] = clamp(state[SQUEEZE]
            + state[SQUEEZE_VELOCITY] * fixed_dt, -0.45, 1.2);

        const double motion_energy = clamp((absolute(state[VELOCITY_X])
            + absolute(state[VELOCITY_Y])) * 1.6 + pressed * 0.55, 0.0, 1.0);
        state[ENERGY] += (motion_energy - state[ENERGY]) * fixed_dt * 2.4;
        state[PHASE] += fixed_dt * (0.22 + state[ENERGY] * 0.8);
        if (state[PHASE] >= 6.283185307179586) state[PHASE] -= 6.283185307179586;
    }
}

double get_state(int index) {
    return index >= 0 && index < STATE_COUNT ? state[index] : 0.0;
}
