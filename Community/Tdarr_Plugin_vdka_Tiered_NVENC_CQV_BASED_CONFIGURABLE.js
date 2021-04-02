/* eslint-disable */
function details () {
  return {
    id: 'Tdarr_Plugin_vdka_Tiered_NVENC_CQV_BASED_CONFIGURABLE',
    Stage: 'Pre-processing',
    Name: 'Tiered FFMPEG+NVENC CQ:V BASED CONFIGURABLE',
    Type: 'Video',
    Operation: 'Transcode',
    Description: `[Contains built-in filter] This plugin uses different CQ:V values (similar to crf but for nvenc) depending on resolution, 
     the CQ:V value is configurable per resolution.
     FFmpeg Preset can be configured, uses slow by default. 
     ALL OPTIONS MUST BE CONFIGURED UNLESS MARKED OPTIONAL!
     If files are not in hevc they will be transcoded. 
     The output container is mkv. \n\n`,
    Version: '1.00',
    Link:
      'https://github.com/HaveAGitGat/Tdarr_Plugins/blob/master/Community/Tdarr_Plugin_vdka_Tiered_NVENC_CQV_BASED_CONFIGURABLE.js',
    Tags: 'pre-processing,ffmpeg,video only,nvenc h265,configurable',

    Inputs: [
      {
        name: 'sdCQV',
        tooltip: `Enter the CQ:V value you want for 480p and 576p content. 
       \\nExample:\\n 
      
      21`
      },
      {
        name: 'hdCQV',
        tooltip: `Enter the CQ:V value you want for 720p content.  
      
      \\nExample:\\n
      23`
      },
      {
        name: 'fullhdCQV',
        tooltip: `Enter the CQ:V value you want for 1080p content.  
      
      \\nExample:\\n
      25`
      },
      {
        name: 'uhdCQV',
        tooltip: `Enter the CQ:V value you want for 4K/UHD/2160p content.  
      
      \\nExample:\\n
      28`
      },
      {
        name: 'bframe',
        tooltip: `Specify amount of b-frames to use, 0-5. Use 0 to disable. (GPU must support this, turing and newer supports this, except for the 1650)  
      
      \\nExample:\\n
      3`
      },
      {
        name: 'ffmpeg_preset',
        tooltip: `OPTIONAL, DEFAULTS TO SLOW IF NOT SET 
      \\n Enter the ffmpeg preset you want, leave blank for default (slow) 
      \\n This only applies if video is transcoded, video already in h264 will not be transcoded with this setting
      
      \\nExample:\\n 
        slow  
      
      \\nExample:\\n 
        medium  
      
      \\nExample:\\n 
        fast  
      
      \\nExample:\\n 
        veryfast`
      }
    ]
  }
}

module.exports.plugin = function plugin (file, librarySettings, inputs) {
  var transcode = 0 //if this var changes to 1 the file will be transcoded
  var subcli = `-c:s copy`
  var maxmux = ''
  var map = '-map 0'
  var cqvinuse = ''
  //default values that will be returned
  var response = {
    processFile: false,
    preset: '',
    container: '.mkv',
    handBrakeMode: false,
    FFmpegMode: false,
    reQueueAfter: true,
    infoLog: '',
    maxmux: false
  }

  //check if the file is a video, if not the function will be stopped immediately
  if (file.fileMedium !== 'video') {
    response.processFile = false
    response.infoLog += '☒File is not a video! \n'
    return response
  } else {
    // bitrateprobe = file.ffProbeData.streams[0].bit_rate;
    response.infoLog += '☑File is a video! \n'
  }

  //check if the file is already hevc, it will not be transcoded if true and the function will be stopped immediately
  if (file.ffProbeData.streams[0].codec_name == 'hevc') {
    response.processFile = false
    response.infoLog += '☑File is already in hevc! \n'
    return response
  }

  // Check if preset is configured, default to slow if not
  var ffmpeg_preset
  if (inputs.ffmpeg_preset === undefined) {
    ffmpeg_preset = `slow`
    response.infoLog += '☑Preset not set, defaulting to slow\n'
  } else {
    ffmpeg_preset = `${inputs.ffmpeg_preset}`
    response.infoLog += `☑Preset set as ${inputs.ffmpeg_preset}\n`
  }

  //codec will be checked so it can be transcoded correctly
  if (file.video_codec_name == 'h263') {
    response.preset = `-hwaccel cuda -c:v h263_cuvid -hwaccel_output_format cuda`
  } else if (file.video_codec_name == 'h264') {
    if (file.ffProbeData.streams[0].profile != 'High 10') {
      //Remove HW Decoding for High 10 Profile
      response.preset = `-hwaccel cuda -c:v h264_cuvid -hwaccel_output_format cuda`
    }
  } else if (file.video_codec_name == 'mjpeg') {
    response.preset = `-hwaccel cuda -c:v mjpeg_cuvid -hwaccel_output_format cuda`
  } else if (file.video_codec_name == 'mpeg1') {
    response.preset = `-hwaccel cuda -c:v mpeg1_cuvid -hwaccel_output_format cuda`
  } else if (file.video_codec_name == 'mpeg2') {
    response.preset = `-hwaccel cuda -c:v mpeg2_cuvid -hwaccel_output_format cuda`
  }
  // skipping this one because it's empty
  //  else if (file.video_codec_name == 'mpeg4') {
  //    response.preset = ``
  //  }
  else if (file.video_codec_name == 'vc1') {
    response.preset = `-hwaccel cuda -c:v vc1_cuvid -hwaccel_output_format cuda`
  } else if (file.video_codec_name == 'vp8') {
    response.preset = `-hwaccel cuda -hwaccel_output_format cuda`
  } else if (file.video_codec_name == 'vp9') {
    response.preset = `-hwaccel cuda -c:v vp9_cuvid -hwaccel_output_format cuda`
  }

  //Set Subtitle Var before adding encode cli
  for (var i = 0; i < file.ffProbeData.streams.length; i++) {
    try {
      if (
        file.ffProbeData.streams[i].codec_name.toLowerCase() == 'mov_text' &&
        file.ffProbeData.streams[i].codec_type.toLowerCase() == 'subtitle'
      ) {
        subcli = `-c:s srt`
      }
    } catch (err) {}
    //mitigate TrueHD audio causing Too many packets error
    try {
      if (
        file.ffProbeData.streams[i].codec_name.toLowerCase() == 'truehd' ||
        (file.ffProbeData.streams[i].codec_name.toLowerCase() == 'dts' &&
          file.ffProbeData.streams[i].profile.toLowerCase() == 'dts-hd ma') ||
        (file.ffProbeData.streams[i].codec_name.toLowerCase() == 'aac' &&
          file.ffProbeData.streams[i].sample_rate.toLowerCase() == '44100' &&
          file.ffProbeData.streams[i].codec_type.toLowerCase() == 'audio')
      ) {
        maxmux = ` -max_muxing_queue_size 9999`
      }
    } catch (err) {}
    //mitigate errors due to embeded pictures
    try {
      if (
        (file.ffProbeData.streams[i].codec_name.toLowerCase() == 'png' ||
          file.ffProbeData.streams[i].codec_name.toLowerCase() == 'bmp' ||
          file.ffProbeData.streams[i].codec_name.toLowerCase() == 'mjpeg') &&
        file.ffProbeData.streams[i].codec_type.toLowerCase() == 'video'
      ) {
        map = `-map 0:v:0 -map 0:a -map 0:s?`
      }
    } catch (err) {}
  }
  //file will be encoded if the resolution is 480p or 576p
  //codec will be checked so it can be transcoded correctly
  if (file.video_resolution === '480p' || file.video_resolution === '576p') {
    cqvinuse = `${inputs.sdCQV}`
    response.preset += `,${map} -dn -c:v hevc_nvenc -rc vbr_hq -b:v 0 -preset ${ffmpeg_preset} -cq ${inputs.sdCQV} -rc-lookahead 32 -bf ${inputs.bframe} -a53cc 0 -c:a copy ${subcli}${maxmux}`
    transcode = 1
  }

  //file will be encoded if the resolution is 720p
  //codec will be checked so it can be transcoded correctly
  if (file.video_resolution === '720p') {
    cqvinuse = `${inputs.hdCQV}`
    response.preset += `,${map} -dn -c:v hevc_nvenc -rc vbr_hq -b:v 0 -preset ${ffmpeg_preset} -cq ${inputs.hdCQV} -rc-lookahead 32 -bf ${inputs.bframe} -a53cc 0 -c:a copy ${subcli}${maxmux}`
    transcode = 1
  }
  //file will be encoded if the resolution is 1080p
  //codec will be checked so it can be transcoded correctly
  if (file.video_resolution === '1080p') {
    cqvinuse = `${inputs.fullhdCQV}`
    response.preset += `,${map} -dn -c:v hevc_nvenc -rc vbr_hq -b:v 0 -preset ${ffmpeg_preset} -cq ${inputs.fullhdCQV} -rc-lookahead 32 -bf ${inputs.bframe} -a53cc 0 -c:a copy ${subcli}${maxmux}`
    transcode = 1
  }
  //file will be encoded if the resolution is 4K
  //codec will be checked so it can be transcoded correctly
  if (file.video_resolution === '4KUHD') {
    cqvinuse = `${inputs.uhdCQV}`
    response.preset += `,${map} -dn -c:v hevc_nvenc -rc vbr_hq -b:v 0 -preset ${ffmpeg_preset} -cq ${inputs.uhdCQV} -rc-lookahead 32 -bf ${inputs.bframe} -a53cc 0 -c:a copy ${subcli}${maxmux}`
    transcode = 1
  }
  //check if the file is eligible for transcoding
  //if true the neccessary response values will be changed
  if (transcode == 1) {
    response.processFile = true
    response.FFmpegMode = true
    response.reQueueAfter = true
    response.infoLog += `☑File is ${file.video_resolution}, using CQ:V value of ${cqvinuse}!\n`
    response.infoLog += `☒File is not hevc!\n`
    response.infoLog += `File is being transcoded!\n`
  }

  return response
}
module.exports.details = details
