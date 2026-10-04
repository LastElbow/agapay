using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

/// <summary>
/// Wire-shape contract tests for the Chat REST endpoints the mobile app parses
/// (see TESTING.md): conversation start/list/history, read receipts, block/unblock,
/// the user-report rate limit, history clearing, and close/reopen.
/// Seeding mirrors ConversationService's participant normalization: ParticipantAId
/// holds the lexicographically smaller user-id (Guid), ParticipantBId the larger.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class ChatContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public ChatContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  /// <summary>
  /// Fresh short-lived context over the factory's InMemory store. The long-lived
  /// <see cref="ContractTestBase.Db"/> scope tracks the seeded entities, so state
  /// written by HTTP requests would be shadowed by its identity map — use this
  /// for every DB assertion made AFTER an HTTP call.
  /// </summary>
  private agapayDbContext FreshDb()
    => new(Factory.Services.GetRequiredService<DbContextOptions<agapayDbContext>>());

  private sealed record ChatSeed(
    User PatientUser, User TherapistUser, Conversation Conversation,
    ChatMessage FromPatient, ChatMessage FromTherapist);

  /// <summary>
  /// Seeds patient + therapist + one Active conversation between them + two TEXT
  /// messages (patient → therapist, then therapist → patient, both unread).
  /// </summary>
  private async Task<ChatSeed> SeedConversationAsync(string prefix)
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail($"{prefix}-patient"));
    var therapistUser = await CreateTherapistUserAsync(DemoEmail($"{prefix}-therapist"));

    // ConversationService.NormalizeParticipants: ParticipantAId is the smaller id.
    var (participantA, participantB) = patientUser.Id.CompareTo(therapistUser.Id) <= 0
      ? (patientUser.Id, therapistUser.Id)
      : (therapistUser.Id, patientUser.Id);

    var conversation = new Conversation
    {
      ParticipantAId = participantA,
      ParticipantBId = participantB,
      Status = "Active",
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
    };
    Db.Conversations.Add(conversation);
    await Db.SaveChangesAsync();

    var fromPatient = new ChatMessage
    {
      ConversationId = conversation.Id,
      SenderId = patientUser.Id,
      ReceiverId = therapistUser.Id,
      Content = "hello from patient",
      MessageType = "TEXT",
      Timestamp = DateTime.UtcNow.AddMinutes(-2),
      IsRead = false,
    };
    var fromTherapist = new ChatMessage
    {
      ConversationId = conversation.Id,
      SenderId = therapistUser.Id,
      ReceiverId = patientUser.Id,
      Content = "hello from therapist",
      MessageType = "TEXT",
      Timestamp = DateTime.UtcNow.AddMinutes(-1),
      IsRead = false,
    };
    Db.ChatMessages.AddRange(fromPatient, fromTherapist);
    await Db.SaveChangesAsync();

    return new ChatSeed(patientUser, therapistUser, conversation, fromPatient, fromTherapist);
  }

  private async Task<HttpClient> ClientForAsync(User user)
  {
    var token = await GetAccessTokenAsync(user.Email!);
    return AuthenticatedClient(token);
  }

  [Fact]
  public async Task StartConversation_ReturnsShape()
  {
    var seed = await SeedConversationAsync("chat-start");
    using var patient = await ClientForAsync(seed.PatientUser);

    var response = await patient.PostAsync($"/api/Chat/conversations/{seed.TherapistUser.Id}", content: null);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "conversationId", "otherUserId", "otherUserName", "otherUserAvatar", "status");
    // The seeded conversation is reused, not duplicated.
    Assert.Equal(seed.Conversation.Id, body.GetProperty("conversationId").GetInt32());
    Assert.Equal(seed.TherapistUser.Id.ToString(), body.GetProperty("otherUserId").GetString());
    Assert.Equal("Active", body.GetProperty("status").GetString());
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("otherUserName").GetString()));
  }

  [Fact]
  public async Task Conversations_ReturnsSummaryShape()
  {
    var seed = await SeedConversationAsync("chat-list");
    using var therapist = await ClientForAsync(seed.TherapistUser);

    var response = await therapist.GetAsync("/api/Chat/conversations");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Single(body.EnumerateArray());
    AssertFieldsOnEveryItem(body,
      "conversationId", "otherUserId", "otherUserName", "otherUserRole", "otherUserAvatar",
      "latestMessage", "latestMessageTimestamp", "unreadCount", "status", "closedAt",
      "closedByUserId", "latestMessageIsMine", "isBlockedByMe", "isBlockedByOther");

    var ours = body.EnumerateArray().First();
    Assert.Equal(seed.Conversation.Id, ours.GetProperty("conversationId").GetInt32());
    Assert.Equal(seed.PatientUser.Id.ToString(), ours.GetProperty("otherUserId").GetString());
    Assert.Equal("Patient", ours.GetProperty("otherUserRole").GetString());
    // The latest message chronologically is the therapist's own reply.
    Assert.Equal("hello from therapist", ours.GetProperty("latestMessage").GetString());
    Assert.Equal(1, ours.GetProperty("unreadCount").GetInt32());
    Assert.Equal("Active", ours.GetProperty("status").GetString());
    Assert.True(ours.GetProperty("latestMessageIsMine").GetBoolean());
  }

  [Fact]
  public async Task History_ReturnsObjectShape_WithCamelCaseMessageFields()
  {
    var seed = await SeedConversationAsync("chat-history");
    using var therapist = await ClientForAsync(seed.TherapistUser);
    using var patient = await ClientForAsync(seed.PatientUser);

    var response = await therapist.GetAsync($"/api/Chat/history/{seed.PatientUser.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "status", "isBlockedByMe", "isBlockedByOther", "closedAt", "closedByUserId",
      "messages", "patientContext", "nextCursor", "hasMore");

    Assert.Equal("Active", body.GetProperty("status").GetString());
    Assert.False(body.GetProperty("isBlockedByMe").GetBoolean());
    Assert.False(body.GetProperty("isBlockedByOther").GetBoolean());
    Assert.Equal(JsonValueKind.Array, body.GetProperty("messages").ValueKind);
    Assert.Equal(2, body.GetProperty("messages").GetArrayLength());

    // Messages are chronological (oldest first in the page).
    var first = body.GetProperty("messages")[0];
    AssertHasFields(first,
      "id", "conversationId", "senderId", "receiverId", "content", "imagePath", "messageType",
      "timestamp", "isRead", "isMine", "signedUrl", "patientContext");
    Assert.Equal("hello from patient", first.GetProperty("content").GetString());
    Assert.Equal("TEXT", first.GetProperty("messageType").GetString());
    Assert.False(first.GetProperty("isMine").GetBoolean()); // therapist is viewing

    // The other user (patient) gets patient context enrichment on every message.
    var messageContext = first.GetProperty("patientContext");
    Assert.Equal(JsonValueKind.Object, messageContext.ValueKind);
    AssertHasFields(messageContext,
      "id", "firstName", "lastName", "dateOfBirth", "relationshipToUser", "address", "barangay",
      "latitude", "longitude", "occupation", "activityLevel", "currentComplaints");
    Assert.Equal("Self", messageContext.GetProperty("relationshipToUser").GetString());

    // The same enriched context is also exposed at the top level.
    Assert.Equal(JsonValueKind.Object, body.GetProperty("patientContext").ValueKind);
    AssertHasFields(body.GetProperty("patientContext"),
      "id", "firstName", "lastName", "dateOfBirth", "relationshipToUser", "address", "barangay",
      "latitude", "longitude", "occupation", "activityLevel", "currentComplaints");

    // FROZEN DIRECTION: when the PATIENT views the therapist's history, the other
    // user has no patient profile — patientContext must be null.
    var patientView = await patient.GetAsync($"/api/Chat/history/{seed.TherapistUser.Id}");
    Assert.Equal(HttpStatusCode.OK, patientView.StatusCode);
    var patientBody = await GetJsonAsync(patientView);
    Assert.Equal(JsonValueKind.Null, patientBody.GetProperty("patientContext").ValueKind);
  }

  [Fact]
  public async Task MarkRead_ReturnsUpdatedMessages()
  {
    var seed = await SeedConversationAsync("chat-read");
    using var patient = await ClientForAsync(seed.PatientUser);

    // Only the therapist -> patient message is unread for the caller.
    var response = await patient.PostAsync($"/api/Chat/history/{seed.TherapistUser.Id}/read", content: null);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "updatedMessages");
    Assert.Equal(1, body.GetProperty("updatedMessages").GetInt32());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.ChatMessages.SingleAsync(m => m.Id == seed.FromTherapist.Id);
      Assert.True(reloaded.IsRead);
      var other = await verify.ChatMessages.SingleAsync(m => m.Id == seed.FromPatient.Id);
      Assert.False(other.IsRead);
    }
  }

  [Fact]
  public async Task BlockUnblock_FreezeActualRoutes()
  {
    var seed = await SeedConversationAsync("chat-block");
    using var patient = await ClientForAsync(seed.PatientUser);

    // Block: POST /api/Chat/block/{otherUserId}.
    var block = await patient.PostAsJsonAsync($"/api/Chat/block/{seed.TherapistUser.Id}", new { reason = "spam" });
    Assert.Equal(HttpStatusCode.OK, block.StatusCode);
    var blockBody = await GetJsonAsync(block);
    AssertHasFields(blockBody, "blockedUserId", "blockedAt", "expiresAt", "reason", "isBlocked");
    Assert.Equal(seed.TherapistUser.Id.ToString(), blockBody.GetProperty("blockedUserId").GetString());
    Assert.True(blockBody.GetProperty("isBlocked").GetBoolean());
    Assert.Equal("spam", blockBody.GetProperty("reason").GetString());
    Assert.Equal(JsonValueKind.Null, blockBody.GetProperty("expiresAt").ValueKind);

    // List: GET /api/Chat/blocks.
    var blocks = await patient.GetAsync("/api/Chat/blocks");
    Assert.Equal(HttpStatusCode.OK, blocks.StatusCode);
    var blocksBody = await GetJsonAsync(blocks);
    Assert.Equal(JsonValueKind.Array, blocksBody.ValueKind);
    Assert.Single(blocksBody.EnumerateArray());
    AssertFieldsOnEveryItem(blocksBody, "blockedUserId", "createdAt", "expiresAt", "reason");
    Assert.Equal(seed.TherapistUser.Id.ToString(), blocksBody.EnumerateArray().First().GetProperty("blockedUserId").GetString());

    // Unblock: DELETE /api/Chat/block/{otherUserId} — the only unblock route the
    // backend exposes (there is no POST /api/Chat/unblock endpoint).
    var unblock = await patient.DeleteAsync($"/api/Chat/block/{seed.TherapistUser.Id}");
    Assert.Equal(HttpStatusCode.OK, unblock.StatusCode);
    var unblockBody = await GetJsonAsync(unblock);
    AssertHasFields(unblockBody, "blockedUserId", "isBlocked");
    Assert.Equal(seed.TherapistUser.Id.ToString(), unblockBody.GetProperty("blockedUserId").GetString());
    Assert.False(unblockBody.GetProperty("isBlocked").GetBoolean());

    using (var verify = FreshDb())
    {
      Assert.Empty(await verify.Blocks.Where(b => b.BlockerUserId == seed.PatientUser.Id).ToListAsync());
    }
  }

  [Fact]
  public async Task Report_ReturnsShape_And429OnSixth()
  {
    var seed = await SeedConversationAsync("chat-report");
    using var patient = await ClientForAsync(seed.PatientUser);

    // The report limiter keys on the REPORTER ("report:{userId}", 5/hour) — the
    // target user can stay the same for all six calls.
    var payload = new
    {
      otherUserId = seed.TherapistUser.Id.ToString(),
      conversationId = seed.Conversation.Id,
      messageId = (int?)null,
      category = "harassment",
      notes = "n",
    };

    for (var i = 1; i <= 5; i++)
    {
      var ok = await patient.PostAsJsonAsync("/api/Chat/report", payload);
      Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
      var body = await GetJsonAsync(ok);
      AssertHasFields(body, "reportId", "createdAt", "status");
      Assert.Equal("New", body.GetProperty("status").GetString());
      Assert.True(body.GetProperty("reportId").GetInt32() > 0);
    }

    // 6th report inside the hour -> 429 with a Retry-After header and a message body.
    var limited = await patient.PostAsJsonAsync("/api/Chat/report", payload);
    Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    Assert.True(limited.Headers.Contains("Retry-After"), "429 response must carry a Retry-After header");
    var limitedBody = await GetJsonUncheckedAsync(limited);
    AssertHasFields(limitedBody, "message");
    Assert.False(string.IsNullOrWhiteSpace(limitedBody.GetProperty("message").GetString()));

    using (var verify = FreshDb())
    {
      Assert.Equal(5, await verify.Reports.CountAsync(r => r.ReporterUserId == seed.PatientUser.Id));
    }
  }

  [Fact]
  public async Task DeleteConversation_ReturnsConversationIdAndMessage()
  {
    var seed = await SeedConversationAsync("chat-delete");
    using var patient = await ClientForAsync(seed.PatientUser);

    // ACTUAL SHAPE: the endpoint clears (hides) the caller's history and returns
    // { conversationId, message } — it does NOT return a messagesDeleted count.
    var response = await patient.DeleteAsync($"/api/Chat/conversations/{seed.TherapistUser.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "conversationId", "message");
    Assert.Equal(seed.Conversation.Id, body.GetProperty("conversationId").GetInt32());
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));

    using (var verify = FreshDb())
    {
      var reloaded = await verify.Conversations.SingleAsync(c => c.Id == seed.Conversation.Id);
      var callerIsA = reloaded.ParticipantAId == seed.PatientUser.Id;
      var clearedForCaller = callerIsA ? reloaded.ClearedAtByParticipantA : reloaded.ClearedAtByParticipantB;
      Assert.NotNull(clearedForCaller);
      var clearedForOther = callerIsA ? reloaded.ClearedAtByParticipantB : reloaded.ClearedAtByParticipantA;
      Assert.Null(clearedForOther);
    }
  }

  [Fact]
  public async Task EndAndReopenConversation_ReturnsStatusShape()
  {
    var seed = await SeedConversationAsync("chat-end");
    using var patient = await ClientForAsync(seed.PatientUser);

    // Close: full status shape with closer identity.
    var end = await patient.PostAsync($"/api/Chat/conversations/{seed.TherapistUser.Id}/end", content: null);
    Assert.Equal(HttpStatusCode.OK, end.StatusCode);
    var endBody = await GetJsonAsync(end);
    AssertHasFields(endBody, "conversationId", "otherUserId", "status", "closedAt", "closedByUserId");
    Assert.Equal(seed.Conversation.Id, endBody.GetProperty("conversationId").GetInt32());
    Assert.Equal(seed.TherapistUser.Id.ToString(), endBody.GetProperty("otherUserId").GetString());
    Assert.Equal("Closed", endBody.GetProperty("status").GetString());
    Assert.Equal(JsonValueKind.String, endBody.GetProperty("closedAt").ValueKind);

    using (var verify = FreshDb())
    {
      var afterEnd = await verify.Conversations.SingleAsync(c => c.Id == seed.Conversation.Id);
      Assert.Equal("Closed", afterEnd.Status);
      Assert.NotNull(afterEnd.ClosedAt);
      Assert.Equal(seed.PatientUser.Id, afterEnd.ClosedByUserId);
    }

    // Reopen: ACTUAL SHAPE only echoes { conversationId, otherUserId, status } —
    // no closedAt / closedByUserId on the reopen payload.
    var reopen = await patient.PostAsync($"/api/Chat/conversations/{seed.TherapistUser.Id}/reopen", content: null);
    Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);
    var reopenBody = await GetJsonAsync(reopen);
    AssertHasFields(reopenBody, "conversationId", "otherUserId", "status");
    Assert.Equal("Active", reopenBody.GetProperty("status").GetString());
    Assert.Equal(seed.Conversation.Id, reopenBody.GetProperty("conversationId").GetInt32());

    using (var verify = FreshDb())
    {
      var afterReopen = await verify.Conversations.SingleAsync(c => c.Id == seed.Conversation.Id);
      Assert.Equal("Active", afterReopen.Status);
      Assert.Null(afterReopen.ClosedAt);
      Assert.Null(afterReopen.ClosedByUserId);
    }
  }
}
