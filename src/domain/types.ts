export interface Point {
  x: number;
  y: number;
}

export type Sku = "A" | "B" | "C" | "D" | "E" | "F";
export type Placement = "popularFar" | "popularNear";
export type Staffing = "pick1Pack1" | "pick1Pack2" | "pick2Pack1" | "pick2Pack2" | "pick3Pack1";
export type Transport = "single" | "cart2" | "cart3" | "cart5";
export type Arrival = "steady" | "burst" | "waves";
export type PackingSpeed = "standard" | "tooled";
export type WorkerId = "W1" | "W2" | "W3" | "W4";

export interface RunConfig {
  placement: Placement;
  staffing: Staffing;
  transport: Transport;
  arrival: Arrival;
  packing: PackingSpeed;
}

export interface ScenarioOrder {
  id: string;
  sku: Sku;
  arrivalTick: number;
}

export interface Shelf {
  id: `S${1 | 2 | 3 | 4 | 5 | 6}`;
  position: Point;
  pickup: Point;
  sku: Sku;
}

export interface Timings {
  singleEdge: number;
  cartEdge: number;
  picking: number;
  unloadingBase: number;
  unloadingPerItem: number;
  packing: number;
  conveying: number;
  truckDeparture: number;
}

export interface Scenario {
  id: string;
  modelVersion: string;
  orders: ScenarioOrder[];
  shelves: Shelf[];
  blocked: Point[];
  depot: Point;
  timings: Timings;
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export type OrderState = "scheduled" | "waiting" | "assigned" | "picked" | "packingQueue" | "packing" | "conveying" | "shipped";
export interface SimulationOrder extends ScenarioOrder {
  state: OrderState;
  workerId?: string;
  pickedTick?: number;
  unloadedTick?: number;
  packingStartedTick?: number;
  packedTick?: number;
  conveyEndTick?: number;
  shippedTick?: number;
}

export type WorkerAction =
  | { type: "idle" }
  | { type: "moving"; path: Point[]; startTick: number; endTick: number; purpose: "toShelf" | "return" }
  | { type: "picking"; orderId: string; startTick: number; endTick: number }
  | { type: "unloading"; orderIds: string[]; startTick: number; endTick: number }
  | { type: "packing"; orderId: string; startTick: number; endTick: number };

export interface TripStop { shelfId: string; pickup: Point; orderIds: string[]; nextOrderIndex: number; }
export interface PickerTrip { orderIds: string[]; stops: TripStop[]; stopIndex: number; phase: "moving" | "atShelf" | "returning" | "atDepot"; }
export interface WorkerState { id: WorkerId; role: "picker" | "packer"; station?: 1 | 2; position: Point; action: WorkerAction; trip?: PickerTrip; distance: number; }
export interface TruckState { status: "waiting" | "departing" | "departed"; startTick?: number; endTick?: number; }
export interface SimulationState {
  timeTick: number;
  status: "active" | "finished" | "error";
  config: RunConfig;
  scenario: Scenario;
  orders: SimulationOrder[];
  workers: WorkerState[];
  truck: TruckState;
  maximumPackingQueue: number;
  error?: string;
}
export type DomainEventType = "arrived" | "assigned" | "itemPicked" | "unloaded" | "packingStarted" | "packed" | "shipped" | "truckDeparted";
export interface DomainEvent { type: DomainEventType; tick: number; orderId?: string; workerId?: string; }
export interface Metrics { shippedCount: number; totalCount: number; lastShipmentTicks: number | null; averageLeadTicks: number | null; totalWalkingDistance: number; maximumPackingQueue: number; }
export interface CompletedResult {
  modelVersion: string; scenarioId: string; config: RunConfig; totalCount: number;
  lastShipmentTick: number; averageLeadTicks: number; totalWalkingDistance: number; maximumPackingQueue: number;
  orders: { id: string; arrivalTick: number; shippedTick: number }[];
}
