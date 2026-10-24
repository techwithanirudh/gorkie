// The subset of the Chime signaling protocol gorkie speaks, trimmed from
// amazon-chime-sdk-js v3.31.0 `SignalingProtocol.proto` (by way of HuddleFM).
// protobufjs skips fields it has no definition for, so frames carrying the
// trimmed ones still decode.
//
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
export const signalingProto = `
syntax = "proto2";

message SdkSignalFrame {
  enum Type {
    JOIN = 1;
    JOIN_ACK = 2;
    SUBSCRIBE = 3;
    SUBSCRIBE_ACK = 4;
    INDEX = 5;
    PAUSE = 7;
    RESUME = 8;
    LEAVE = 9;
    LEAVE_ACK = 10;
    BITRATES = 13;
    AUDIO_CONTROL = 16;
    AUDIO_METADATA = 17;
    AUDIO_STREAM_ID_INFO = 18;
    PING_PONG = 19;
    AUDIO_STATUS = 20;
    CLIENT_METRIC = 21;
    DATA_MESSAGE = 22;
    REMOTE_VIDEO_UPDATE = 24;
    PRIMARY_MEETING_JOIN = 25;
    PRIMARY_MEETING_JOIN_ACK = 26;
    PRIMARY_MEETING_LEAVE = 27;
    NOTIFICATION = 34;
    MEETING_SESSION_TIMING = 43;
  }
  required uint64 timestamp_ms = 1;
  required Type type = 2;
  optional SdkErrorFrame error = 3;
  optional SdkJoinFrame join = 4;
  optional SdkJoinAckFrame joinack = 5;
  optional SdkSubscribeFrame sub = 6;
  optional SdkSubscribeAckFrame suback = 7;
  optional SdkLeaveFrame leave = 11;
  optional SdkAudioMetadataFrame audio_metadata = 18;
  optional SdkAudioStreamIdInfoFrame audio_stream_id_info = 19;
  optional SdkPingPongFrame ping_pong = 20;
  optional SdkAudioStatusFrame audio_status = 21;
}

message SdkErrorFrame {
  optional uint32 status = 1;
  optional string description = 2;
}

message SdkClientDetails {
  optional string app_name = 1;
  optional string app_version = 2;
  optional string device_model = 3;
  optional string device_make = 4;
  optional string platform_name = 5;
  optional string platform_version = 6;
  optional string client_source = 7;
  optional string chime_sdk_version = 8;
}

message SdkJoinFrame {
  optional uint32 protocol_version = 1 [default=2];
  optional uint32 flags = 3;
  optional SdkClientDetails client_details = 4;
  optional uint64 audio_session_id = 6;
  optional bool wants_compressed_sdp = 7;
}

message SdkTurnCredentials {
  optional string username = 1;
  optional string password = 2;
  optional uint32 ttl = 3;
  repeated string uris = 4;
}

message SdkJoinAckFrame {
  optional SdkTurnCredentials turn_credentials = 1;
}

message SdkLeaveFrame {}

enum SdkStreamServiceType {
  RX = 1;
  TX = 2;
  DUPLEX = 3;
}

enum SdkStreamMediaType {
  AUDIO = 1;
  VIDEO = 2;
}

message SdkStreamDescriptor {
  optional uint32 stream_id = 1;
  optional uint32 framerate = 2;
  optional uint32 max_bitrate_kbps = 3;
  optional string track_label = 4;
  optional uint32 group_id = 6;
  optional uint32 avg_bitrate_bps = 7;
  optional string attendee_id = 8;
  optional SdkStreamMediaType media_type = 9;
  optional string external_user_id = 10;
}

message SdkSubscribeFrame {
  optional SdkStreamServiceType duplex = 1 [default=RX];
  repeated SdkStreamDescriptor send_streams = 2;
  repeated uint32 receive_stream_ids = 3;
  optional string sdp_offer = 4;
  optional string audio_host = 5;
  optional bool audio_checkin = 6;
  optional bool audio_muted = 7;
}

message SdkSubscribeAckFrame {
  optional SdkStreamServiceType duplex = 1;
  optional string sdp_answer = 3;
}

message SdkAudioMetadataFrame {
  repeated SdkAudioAttendeeState attendee_states = 1;
}

message SdkAudioAttendeeState {
  optional uint32 audio_stream_id = 1;
  optional uint32 volume = 2;
  optional bool muted = 3;
}

message SdkAudioStreamIdInfoFrame {
  repeated SdkAudioStreamIdInfo streams = 1;
}

message SdkAudioStreamIdInfo {
  optional uint32 audio_stream_id = 1;
  optional string attendee_id = 2;
  optional bool muted = 3;
  optional string external_user_id = 4;
  optional bool dropped = 5;
}

enum SdkPingPongType {
  PING = 1;
  PONG = 2;
}

message SdkPingPongFrame {
  required SdkPingPongType type = 1;
  required uint32 ping_id = 2;
}

message SdkAudioStatusFrame {
  optional uint32 audio_status = 1;
}
`;
