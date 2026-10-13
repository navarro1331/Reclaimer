/* Independently authored freestanding provider specimen. Never executed by tests. */
struct Packet {
    int tag;
    unsigned count;
    long weight;
    unsigned char mode;
};
typedef struct Packet PacketAlias;
union Payload { long whole; unsigned char bytes[8]; };
enum Route { RouteZero = 0, RouteOne = 1, RouteTwo = 2, RouteThree = 3,
             RouteFour = 4, RouteFive = 5, RouteSix = 6 };
struct Flags { unsigned ready : 1; unsigned mode : 3; };
volatile PacketAlias global_packet = { 4, 7, 11, 2 };
volatile PacketAlias packet_series[3];
volatile union Payload global_payload = { 0x1234 };
volatile enum Route global_route = RouteTwo;
volatile struct Flags global_flags = { 1, 3 };

__attribute__((noinline)) int proof_add(int left, int right) {
    return left * 3 + right;
}
__attribute__((noinline)) int proof_read(volatile PacketAlias *packet) {
    return packet->tag + packet->count + (int)packet->weight + packet->mode;
}
__attribute__((noinline)) int proof_choose(int route, int seed) {
    switch (route) {
    case 0: return proof_add(seed, 11);
    case 1: return proof_add(seed * 2, 13);
    case 2: return proof_add(seed - 3, 17);
    case 3: return proof_add(seed + 5, 19);
    case 4: return proof_add(seed ^ 7, 23);
    case 5: return proof_add(seed | 9, 29);
    case 6: return proof_add(seed & 11, 31);
    default: return proof_add(seed, 37);
    }
}
int proof_entry(void) {
    return proof_choose(global_route, proof_read(&global_packet)) + proof_add(2, 5);
}
