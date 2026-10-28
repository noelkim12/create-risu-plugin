<!-- ai-services-readme -->
## AI Services

AI Services groups settings for every selected LLM, embedding, contextual
embedding, and reranker consumer. Open **AI Services** first. The **Keys**
section is the shared place to add, edit, reveal, and delete provider
credentials, including projects that select only a retrieval consumer.

Registration follows this order: AI Services, its internal credential manager,
then the selected consumers. The internal manager is implementation detail, not
a selectable scaffold feature and not a separate settings screen.

Create a key before configuring a consumer that needs authentication. Consumer
settings link to a compatible key by its immutable ID. Key lists show metadata
and masks, not raw secrets. Leaving an existing secret field blank retains the
stored value. Use least-privilege, revocable credentials on a trusted device.
