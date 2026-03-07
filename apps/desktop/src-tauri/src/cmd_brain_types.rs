use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct ListEntitiesOpts {
    #[serde(rename = "type")]
    pub(crate) entity_type: Option<String>,
    pub(crate) search: Option<String>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct ListRelationsOpts {
    #[serde(rename = "type")]
    pub(crate) rel_type: Option<String>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct ListObservationsOpts {
    #[serde(rename = "type")]
    pub(crate) obs_type: Option<String>,
    pub(crate) search: Option<String>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct ListEventsOpts {
    pub(crate) source: Option<String>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListConversationsOpts {
    pub(crate) platform: Option<String>,
    pub(crate) node_ids: Option<Vec<String>>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct GetConversationOpts {
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListFactsOpts {
    pub(crate) node_id: Option<String>,
    pub(crate) workspace_id: Option<String>,
    pub(crate) offset: Option<u64>,
    pub(crate) limit: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateEntityFields {
    pub(crate) name: Option<String>,
    pub(crate) summary: Option<String>,
    #[serde(rename = "type")]
    pub(crate) entity_type: Option<String>,
}
