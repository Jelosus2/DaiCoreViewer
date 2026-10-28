export interface ModelLayerSlot {
    id: string;
    name: string;
    enabled: boolean;
    attachments: Array<{ name: string; enabled: boolean }>;
}

export interface ModelLayerGroup {
    id: string;
    name: string;
    slots: ModelLayerSlot[];
}
